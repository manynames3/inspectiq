terraform {
  required_version = ">= 1.6.0"
  backend "s3" {
    bucket       = "inspectiq-terraform-state-636305658578"
    key          = "inspectiq/live/terraform.tfstate"
    region       = "us-east-1"
    encrypt      = true
    use_lockfile = true
  }
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

data "aws_caller_identity" "current" {}

locals {
  lambda_zip                   = "${path.module}/../../dist/inspectiq-lambda.zip"
  projector_zip                = "${path.module}/../../dist/inspectiq-operations-projector.zip"
  api_lambda_name              = "${var.project_name}-api"
  worker_lambda_name           = "${var.project_name}-image-worker"
  allowed_origins              = distinct(concat(var.allowed_web_origins, ["http://localhost:5173"]))
  public_suffix                = substr(sha256(data.aws_caller_identity.current.account_id), 0, 10)
  bedrock_is_inference_profile = startswith(var.bedrock_model_id, "us.") || startswith(var.bedrock_model_id, "global.")
  bedrock_foundation_model_id  = local.bedrock_is_inference_profile ? replace(var.bedrock_model_id, "/^(us|global)\\./", "") : var.bedrock_model_id
  bedrock_model_resources = local.bedrock_is_inference_profile ? [
    "arn:aws:bedrock:${var.aws_region}:${data.aws_caller_identity.current.account_id}:inference-profile/${var.bedrock_model_id}",
    "arn:aws:bedrock:*::foundation-model/${local.bedrock_foundation_model_id}"
    ] : [
    "arn:aws:bedrock:${var.aws_region}::foundation-model/${local.bedrock_foundation_model_id}"
  ]
  alarm_actions = var.alarm_email == "" ? [] : [aws_sns_topic.operations_alerts.arn]
}

resource "aws_s3_bucket" "vehicle_images" {
  bucket_prefix = "${var.project_name}-vehicle-images-"
}

resource "aws_s3_bucket_public_access_block" "vehicle_images" {
  bucket                  = aws_s3_bucket.vehicle_images.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "vehicle_images" {
  bucket = aws_s3_bucket.vehicle_images.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_cors_configuration" "vehicle_images" {
  bucket = aws_s3_bucket.vehicle_images.id
  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["PUT", "GET", "HEAD"]
    allowed_origins = local.allowed_origins
    expose_headers  = ["ETag", "x-amz-checksum-sha256"]
    max_age_seconds = 300
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "vehicle_images" {
  bucket = aws_s3_bucket.vehicle_images.id

  rule {
    id     = "abort-incomplete-uploads"
    status = "Enabled"
    filter {}
    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

resource "aws_sqs_queue" "image_analysis_dlq" {
  name                      = "${var.project_name}-image-analysis-dlq"
  message_retention_seconds = 1209600
}

resource "aws_sqs_queue" "image_analysis" {
  name                       = "${var.project_name}-image-analysis"
  visibility_timeout_seconds = 180
  message_retention_seconds  = 345600
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.image_analysis_dlq.arn
    maxReceiveCount     = 3
  })
}

resource "aws_sqs_queue" "domain_event_dlq" {
  name                      = "${var.project_name}-domain-events-dlq"
  message_retention_seconds = 1209600
}

resource "aws_dynamodb_table" "operations" {
  name         = "${var.project_name}-operations"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }

  attribute {
    name = "gsi1pk"
    type = "S"
  }

  attribute {
    name = "gsi1sk"
    type = "S"
  }

  global_secondary_index {
    name            = "gsi1"
    hash_key        = "gsi1pk"
    range_key       = "gsi1sk"
    projection_type = "ALL"
  }

  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }

  server_side_encryption {
    enabled = true
  }
}

resource "aws_cloudwatch_event_bus" "domain" {
  name = "${var.project_name}-domain"
}

resource "aws_secretsmanager_secret" "database_url" {
  name        = "${var.project_name}/neon/database-url"
  description = "Neon pooled Postgres connection string for InspectIQ."
}

resource "aws_cognito_user_pool" "inspectiq" {
  name = "${var.project_name}-users"

  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  schema {
    name                = "email"
    attribute_data_type = "String"
    required            = true
    mutable             = true
  }
}

resource "aws_cognito_user_pool_client" "web" {
  name                                 = "${var.project_name}-web"
  user_pool_id                         = aws_cognito_user_pool.inspectiq.id
  generate_secret                      = false
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["email", "openid", "profile"]
  callback_urls                        = var.cognito_callback_urls
  logout_urls                          = var.cognito_logout_urls
  supported_identity_providers         = ["COGNITO"]
  explicit_auth_flows                  = ["ALLOW_USER_SRP_AUTH", "ALLOW_USER_PASSWORD_AUTH", "ALLOW_ADMIN_USER_PASSWORD_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"]
}

resource "aws_cognito_user_pool_domain" "inspectiq" {
  domain       = "${var.project_name}-${local.public_suffix}"
  user_pool_id = aws_cognito_user_pool.inspectiq.id
}

resource "aws_cognito_user_pool_ui_customization" "web" {
  user_pool_id = aws_cognito_user_pool.inspectiq.id
  client_id    = aws_cognito_user_pool_client.web.id

  css = <<-CSS
  .background-customizable {
    border: 1px solid #d7e1eb;
    border-radius: 14px;
    overflow: hidden;
    background: #ffffff;
    box-shadow: 0 24px 70px rgba(15, 31, 48, 0.2);
  }

  .banner-customizable {
    min-height: 96px;
    padding: 24px 28px 20px;
    background-color: #091d32;
    background-image: url("data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='420'%20height='96'%20viewBox='0%200%20420%2096'%3E%3Ctext%20x='28'%20y='40'%20fill='%23ffffff'%20font-family='Arial,sans-serif'%20font-size='27'%20font-weight='800'%3EInspectIQ%3C/text%3E%3Ctext%20x='28'%20y='63'%20fill='%23a9c7e7'%20font-family='Arial,sans-serif'%20font-size='13'%20font-weight='600'%3ESecure%20inspection%20workbench%3C/text%3E%3C/svg%3E");
    background-position: left center;
    background-repeat: no-repeat;
    background-size: 420px 96px;
    border-bottom: 1px solid #102c47;
    text-align: left;
  }

  .textDescription-customizable {
    display: block;
    margin: 0 0 22px;
    color: #172033;
    font-size: 19px;
    font-weight: 760;
    line-height: 1.35;
    text-align: left;
  }

  .label-customizable {
    display: block;
    margin: 14px 0 7px;
    color: #34445a;
    font-size: 13px;
    font-weight: 720;
    line-height: 1.2;
  }

  .inputField-customizable {
    width: 100%;
    height: 44px;
    border: 1px solid #c7d3e0;
    border-radius: 8px;
    background: #ffffff;
    box-shadow: none;
    color: #172033;
    font-size: 15px;
    line-height: 20px;
    padding: 10px 12px;
  }

  .redirect-customizable {
    color: #0b65c2;
    font-size: 13px;
    font-weight: 700;
    text-decoration: none;
  }

  .submitButton-customizable {
    width: 100%;
    height: 46px;
    margin-top: 22px;
    border: 0;
    border-radius: 8px;
    background: #0b65c2;
    box-shadow: 0 10px 22px rgba(11, 101, 194, 0.24);
    color: #ffffff;
    font-size: 14px;
    font-weight: 800;
    line-height: 20px;
    text-transform: none;
  }

  .errorMessage-customizable {
    margin: 0 0 14px;
    border-radius: 8px;
    color: #a31b1b;
    font-size: 13px;
    font-weight: 700;
  }

  .legalText-customizable {
    color: #5a6b80;
    font-size: 12px;
    line-height: 1.45;
  }

  .passwordCheck-valid-customizable {
    color: #007c6d;
  }

  .passwordCheck-notValid-customizable {
    color: #c24a00;
  }
  CSS
}

resource "aws_cognito_user_group" "inspector" {
  name         = "inspector"
  user_pool_id = aws_cognito_user_pool.inspectiq.id
  description  = "Can create inspections, capture photos, and run image analysis."
  precedence   = 30
}

resource "aws_cognito_user_group" "reviewer" {
  name         = "reviewer"
  user_pool_id = aws_cognito_user_pool.inspectiq.id
  description  = "Can review AI findings, confirm damage, grade, draft, and finalize reports."
  precedence   = 20
}

resource "aws_cognito_user_group" "admin" {
  name         = "admin"
  user_pool_id = aws_cognito_user_pool.inspectiq.id
  description  = "Full InspectIQ workflow and exception-management access."
  precedence   = 10
}

resource "aws_iam_role" "lambda" {
  name = "${var.project_name}-lambda-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Action    = "sts:AssumeRole"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "lambda_app" {
  name = "${var.project_name}-lambda-app"
  role = aws_iam_role.lambda.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = aws_secretsmanager_secret.database_url.arn
      },
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:AbortMultipartUpload"
        ]
        Resource = "${aws_s3_bucket.vehicle_images.arn}/*"
      },
      {
        Effect = "Allow"
        Action = [
          "sqs:SendMessage",
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:ChangeMessageVisibility",
          "sqs:GetQueueAttributes"
        ]
        Resource = aws_sqs_queue.image_analysis.arn
      },
      {
        Effect = "Allow"
        Action = [
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes"
        ]
        Resource = aws_sqs_queue.domain_event_dlq.arn
      },
      {
        Effect = "Allow"
        Action = [
          "bedrock:InvokeModel",
          "bedrock:InvokeModelWithResponseStream"
        ]
        Resource = local.bedrock_model_resources
      },
      {
        Effect = "Allow"
        Action = [
          "events:PutEvents"
        ]
        Resource = aws_cloudwatch_event_bus.domain.arn
      },
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:Query",
          "dynamodb:TransactWriteItems"
        ]
        Resource = [
          aws_dynamodb_table.operations.arn,
          "${aws_dynamodb_table.operations.arn}/index/*"
        ]
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_xray" {
  role       = aws_iam_role.lambda.name
  policy_arn = "arn:aws:iam::aws:policy/AWSXRayDaemonWriteAccess"
}

resource "aws_iam_role" "github_deploy" {
  name = "${var.project_name}-github-deploy"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = "sts:AssumeRoleWithWebIdentity"
      Principal = {
        Federated = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:oidc-provider/token.actions.githubusercontent.com"
      }
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          "token.actions.githubusercontent.com:sub" = "repo:${var.github_repository}:environment:production"
        }
      }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "github_deploy_power_user" {
  role       = aws_iam_role.github_deploy.name
  policy_arn = "arn:aws:iam::aws:policy/PowerUserAccess"
}

resource "aws_iam_role_policy" "github_deploy_iam" {
  name = "${var.project_name}-github-deploy-iam"
  role = aws_iam_role.github_deploy.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "iam:CreateRole",
          "iam:DeleteRole",
          "iam:GetRole",
          "iam:TagRole",
          "iam:UntagRole",
          "iam:UpdateAssumeRolePolicy",
          "iam:PutRolePolicy",
          "iam:GetRolePolicy",
          "iam:DeleteRolePolicy",
          "iam:AttachRolePolicy",
          "iam:DetachRolePolicy",
          "iam:ListRolePolicies",
          "iam:ListAttachedRolePolicies",
          "iam:PassRole"
        ]
        Resource = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/${var.project_name}-*"
      },
      {
        Effect = "Allow"
        Action = [
          "iam:GetOpenIDConnectProvider",
          "iam:ListOpenIDConnectProviders"
        ]
        Resource = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:oidc-provider/token.actions.githubusercontent.com"
      },
      {
        Effect   = "Allow"
        Action   = ["budgets:ViewBudget", "budgets:ModifyBudget"]
        Resource = "*"
      }
    ]
  })
}

resource "aws_iam_role" "operations_projector" {
  name = "${var.project_name}-operations-projector-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Action    = "sts:AssumeRole"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "operations_projector_basic" {
  role       = aws_iam_role.operations_projector.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "operations_projector_xray" {
  role       = aws_iam_role.operations_projector.name
  policy_arn = "arn:aws:iam::aws:policy/AWSXRayDaemonWriteAccess"
}

resource "aws_iam_role_policy" "operations_projector" {
  name = "${var.project_name}-operations-projector"
  role = aws_iam_role.operations_projector.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:TransactWriteItems"
      ]
      Resource = aws_dynamodb_table.operations.arn
    }]
  })
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/aws/lambda/${local.api_lambda_name}"
  retention_in_days = 30
}

resource "aws_cloudwatch_log_group" "worker" {
  name              = "/aws/lambda/${local.worker_lambda_name}"
  retention_in_days = 30
}

resource "aws_cloudwatch_log_group" "operations_projector" {
  name              = "/aws/lambda/${var.project_name}-operations-projector"
  retention_in_days = 30
}

resource "aws_lambda_function" "api" {
  function_name    = local.api_lambda_name
  role             = aws_iam_role.lambda.arn
  runtime          = "nodejs22.x"
  handler          = "api.handler"
  filename         = local.lambda_zip
  source_code_hash = filebase64sha256(local.lambda_zip)
  timeout          = 30
  memory_size      = 1024

  environment {
    variables = {
      NODE_ENV                            = "production"
      AWS_NODEJS_CONNECTION_REUSE_ENABLED = "1"
      PERSISTENCE_MODE                    = "postgres"
      DATABASE_SECRET_ARN                 = aws_secretsmanager_secret.database_url.arn
      DB_SCHEMA_PATH                      = "/var/task/schema.sql"
      DB_MIGRATIONS_PATH                  = "/var/task/migrations"
      IMAGE_BUCKET                        = aws_s3_bucket.vehicle_images.bucket
      IMAGE_UPLOAD_MODE                   = "presigned"
      IMAGE_ANALYSIS_MODE                 = "queue"
      IMAGE_ANALYSIS_QUEUE_URL            = aws_sqs_queue.image_analysis.url
      ENABLE_REFERENCE_EVIDENCE           = "false"
      ENABLE_EVALUATION_MODE              = var.enable_evaluation_mode ? "true" : "false"
      VISION_PROVIDER                     = "bedrock"
      REPORT_PROVIDER                     = "bedrock"
      BEDROCK_MODEL_ID                    = var.bedrock_model_id
      BEDROCK_MONTHLY_IMAGE_LIMIT         = tostring(var.bedrock_monthly_image_limit)
      BEDROCK_MONTHLY_REPORT_LIMIT        = tostring(var.bedrock_monthly_report_limit)
      OPERATIONS_TABLE_NAME               = aws_dynamodb_table.operations.name
      DOMAIN_EVENT_BUS_NAME               = aws_cloudwatch_event_bus.domain.name
      DOMAIN_EVENT_SOURCE                 = "inspectiq.api"
      DOMAIN_EVENT_DLQ_URL                = aws_sqs_queue.domain_event_dlq.url
      BEDROCK_VISION_FALLBACK             = "fail"
      MIN_DAMAGE_CONFIDENCE               = "0.80"
      AUTH_MODE                           = "jwt"
      OIDC_ISSUER                         = "https://cognito-idp.${var.aws_region}.amazonaws.com/${aws_cognito_user_pool.inspectiq.id}"
      OIDC_AUDIENCE                       = aws_cognito_user_pool_client.web.id
      DEFAULT_AUTH_ROLE                   = "inspector"
      REQUIRE_JWT_ROLE_CLAIM              = "false"
      AUTH_ADMIN_EMAILS                   = "aidenrhaacloud@gmail.com"
      WEB_ORIGIN                          = join(",", local.allowed_origins)
      PG_POOL_SIZE                        = "2"
    }
  }

  depends_on = [aws_cloudwatch_log_group.api]

  tracing_config {
    mode = "Active"
  }
}

resource "aws_lambda_function" "image_worker" {
  function_name    = local.worker_lambda_name
  role             = aws_iam_role.lambda.arn
  runtime          = "nodejs22.x"
  handler          = "imageWorker.handler"
  filename         = local.lambda_zip
  source_code_hash = filebase64sha256(local.lambda_zip)
  timeout          = 120
  memory_size      = 1536

  environment {
    variables = {
      NODE_ENV                            = "production"
      AWS_NODEJS_CONNECTION_REUSE_ENABLED = "1"
      PERSISTENCE_MODE                    = "postgres"
      DATABASE_SECRET_ARN                 = aws_secretsmanager_secret.database_url.arn
      DB_SCHEMA_PATH                      = "/var/task/schema.sql"
      DB_MIGRATIONS_PATH                  = "/var/task/migrations"
      IMAGE_BUCKET                        = aws_s3_bucket.vehicle_images.bucket
      IMAGE_UPLOAD_MODE                   = "presigned"
      VISION_PROVIDER                     = "bedrock"
      BEDROCK_MODEL_ID                    = var.bedrock_model_id
      BEDROCK_MONTHLY_IMAGE_LIMIT         = tostring(var.bedrock_monthly_image_limit)
      OPERATIONS_TABLE_NAME               = aws_dynamodb_table.operations.name
      DOMAIN_EVENT_BUS_NAME               = aws_cloudwatch_event_bus.domain.name
      DOMAIN_EVENT_SOURCE                 = "inspectiq.worker"
      BEDROCK_VISION_FALLBACK             = "fail"
      MIN_DAMAGE_CONFIDENCE               = "0.80"
      PG_POOL_SIZE                        = "2"
    }
  }

  depends_on = [aws_cloudwatch_log_group.worker]

  tracing_config {
    mode = "Active"
  }
}

resource "aws_lambda_function" "operations_projector" {
  function_name                  = "${var.project_name}-operations-projector"
  role                           = aws_iam_role.operations_projector.arn
  runtime                        = "python3.12"
  handler                        = "handler.handler"
  filename                       = local.projector_zip
  source_code_hash               = filebase64sha256(local.projector_zip)
  timeout                        = 20
  memory_size                    = 256
  reserved_concurrent_executions = 2

  environment {
    variables = {
      OPERATIONS_TABLE_NAME = aws_dynamodb_table.operations.name
    }
  }

  tracing_config {
    mode = "Active"
  }

  depends_on = [aws_cloudwatch_log_group.operations_projector]
}

resource "aws_cloudwatch_event_rule" "domain_projection" {
  name           = "${var.project_name}-domain-projection"
  event_bus_name = aws_cloudwatch_event_bus.domain.name
  event_pattern = jsonencode({
    source = ["inspectiq.api", "inspectiq.worker"]
    "detail-type" = [
      "inspection.created",
      "photo.uploaded",
      "image.analysis.completed",
      "image.analysis.failed",
      "image.retake.required",
      "suggestion.reviewed",
      "report.finalized"
    ]
  })
}

resource "aws_cloudwatch_event_target" "operations_projector" {
  rule           = aws_cloudwatch_event_rule.domain_projection.name
  event_bus_name = aws_cloudwatch_event_bus.domain.name
  arn            = aws_lambda_function.operations_projector.arn

  dead_letter_config {
    arn = aws_sqs_queue.domain_event_dlq.arn
  }

  retry_policy {
    maximum_event_age_in_seconds = 3600
    maximum_retry_attempts       = 3
  }
}

resource "aws_lambda_permission" "eventbridge_projector" {
  statement_id  = "AllowEventBridgeOperationsProjection"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.operations_projector.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.domain_projection.arn
}

resource "aws_sqs_queue_policy" "domain_event_dlq" {
  queue_url = aws_sqs_queue.domain_event_dlq.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "events.amazonaws.com" }
      Action    = "sqs:SendMessage"
      Resource  = aws_sqs_queue.domain_event_dlq.arn
      Condition = {
        ArnEquals = { "aws:SourceArn" = aws_cloudwatch_event_rule.domain_projection.arn }
      }
    }]
  })
}

resource "aws_lambda_event_source_mapping" "image_worker" {
  event_source_arn        = aws_sqs_queue.image_analysis.arn
  function_name           = aws_lambda_function.image_worker.arn
  batch_size              = 1
  function_response_types = ["ReportBatchItemFailures"]

  scaling_config {
    maximum_concurrency = 2
  }

  depends_on = [aws_iam_role_policy.lambda_app]
}

resource "aws_apigatewayv2_api" "http" {
  name          = "${var.project_name}-api"
  protocol_type = "HTTP"

  cors_configuration {
    allow_credentials = false
    allow_headers     = ["authorization", "content-type", "x-actor-id", "x-actor-name", "x-actor-role", "x-evaluation-mode", "x-inspectiq-evaluation-mode", "x-request-id", "idempotency-key"]
    allow_methods     = ["GET", "POST", "PATCH", "DELETE", "OPTIONS"]
    allow_origins     = local.allowed_origins
    expose_headers    = ["content-disposition", "x-request-id"]
    max_age           = 300
  }
}

resource "aws_apigatewayv2_integration" "api" {
  api_id                 = aws_apigatewayv2_api.http.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.api.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_authorizer" "jwt" {
  count            = var.enable_cognito_authorizer ? 1 : 0
  api_id           = aws_apigatewayv2_api.http.id
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]
  name             = "${var.project_name}-cognito"

  jwt_configuration {
    audience = [aws_cognito_user_pool_client.web.id]
    issuer   = "https://cognito-idp.${var.aws_region}.amazonaws.com/${aws_cognito_user_pool.inspectiq.id}"
  }
}

resource "aws_apigatewayv2_route" "default" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "$default"
  target             = "integrations/${aws_apigatewayv2_integration.api.id}"
  authorization_type = "NONE"
}

resource "aws_apigatewayv2_route" "evaluation" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "ANY /api/evaluation/{proxy+}"
  target             = "integrations/${aws_apigatewayv2_integration.api.id}"
  authorization_type = "NONE"
}

resource "aws_apigatewayv2_route" "health" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "GET /api/health"
  target             = "integrations/${aws_apigatewayv2_integration.api.id}"
  authorization_type = "NONE"
}

resource "aws_apigatewayv2_route" "sample_images" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "GET /sample-images/{proxy+}"
  target             = "integrations/${aws_apigatewayv2_integration.api.id}"
  authorization_type = "NONE"
}

resource "aws_apigatewayv2_route" "photo_image" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "GET /api/photos/{photoId}/image"
  target             = "integrations/${aws_apigatewayv2_integration.api.id}"
  authorization_type = "NONE"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.http.id
  name        = "$default"
  auto_deploy = true
}

resource "aws_lambda_permission" "api_gateway" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.http.execution_arn}/*/*"
}

resource "aws_sns_topic" "operations_alerts" {
  name = "${var.project_name}-operations-alerts"
}

resource "aws_sns_topic_subscription" "operations_email" {
  count     = var.alarm_email == "" ? 0 : 1
  topic_arn = aws_sns_topic.operations_alerts.arn
  protocol  = "email"
  endpoint  = var.alarm_email
}

resource "aws_budgets_budget" "monthly" {
  count        = var.alarm_email == "" ? 0 : 1
  name         = "${var.project_name}-monthly-cost"
  budget_type  = "COST"
  limit_amount = tostring(var.monthly_budget_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 50
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = [var.alarm_email]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.alarm_email]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.alarm_email]
  }
}

resource "aws_cloudwatch_metric_alarm" "api_errors" {
  alarm_name          = "${var.project_name}-api-errors"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 60
  statistic           = "Sum"
  threshold           = 1
  alarm_actions       = local.alarm_actions
  treat_missing_data  = "notBreaching"
  dimensions = {
    FunctionName = aws_lambda_function.api.function_name
  }
}

resource "aws_cloudwatch_metric_alarm" "worker_errors" {
  alarm_name          = "${var.project_name}-worker-errors"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 60
  statistic           = "Sum"
  threshold           = 1
  alarm_actions       = local.alarm_actions
  treat_missing_data  = "notBreaching"
  dimensions = {
    FunctionName = aws_lambda_function.image_worker.function_name
  }
}

resource "aws_cloudwatch_metric_alarm" "image_dlq_visible" {
  alarm_name          = "${var.project_name}-image-dlq-visible"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = 60
  statistic           = "Maximum"
  threshold           = 1
  alarm_actions       = local.alarm_actions
  treat_missing_data  = "notBreaching"
  dimensions = {
    QueueName = aws_sqs_queue.image_analysis_dlq.name
  }
}

resource "aws_cloudwatch_metric_alarm" "image_queue_age" {
  alarm_name          = "${var.project_name}-image-queue-age"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 2
  metric_name         = "ApproximateAgeOfOldestMessage"
  namespace           = "AWS/SQS"
  period              = 60
  statistic           = "Maximum"
  threshold           = 300
  alarm_actions       = local.alarm_actions
  treat_missing_data  = "notBreaching"
  dimensions = {
    QueueName = aws_sqs_queue.image_analysis.name
  }
}

resource "aws_cloudwatch_metric_alarm" "api_p95_latency" {
  alarm_name          = "${var.project_name}-api-p95-latency"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 3
  metric_name         = "Latency"
  namespace           = "AWS/ApiGateway"
  period              = 60
  extended_statistic  = "p95"
  threshold           = 2000
  alarm_actions       = local.alarm_actions
  treat_missing_data  = "notBreaching"
  dimensions = {
    ApiId = aws_apigatewayv2_api.http.id
    Stage = aws_apigatewayv2_stage.default.name
  }
}

resource "aws_cloudwatch_metric_alarm" "operations_projector_errors" {
  alarm_name          = "${var.project_name}-operations-projector-errors"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 60
  statistic           = "Sum"
  threshold           = 1
  alarm_actions       = local.alarm_actions
  treat_missing_data  = "notBreaching"
  dimensions = {
    FunctionName = aws_lambda_function.operations_projector.function_name
  }
}

resource "aws_cloudwatch_metric_alarm" "domain_event_dlq_visible" {
  alarm_name          = "${var.project_name}-domain-event-dlq-visible"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = 60
  statistic           = "Maximum"
  threshold           = 1
  alarm_actions       = local.alarm_actions
  treat_missing_data  = "notBreaching"
  dimensions = {
    QueueName = aws_sqs_queue.domain_event_dlq.name
  }
}

resource "aws_cloudwatch_metric_alarm" "pending_outbox_age" {
  alarm_name          = "${var.project_name}-pending-outbox-age"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "PendingOutboxAgeSeconds"
  namespace           = "InspectIQ"
  period              = 60
  statistic           = "Maximum"
  threshold           = 300
  alarm_actions       = local.alarm_actions
  treat_missing_data  = "notBreaching"
}

resource "aws_cloudwatch_metric_alarm" "bedrock_throttles" {
  alarm_name          = "${var.project_name}-bedrock-throttles"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "BedrockThrottles"
  namespace           = "InspectIQ"
  period              = 60
  statistic           = "Sum"
  threshold           = 1
  alarm_actions       = local.alarm_actions
  treat_missing_data  = "notBreaching"
}

resource "aws_cloudwatch_metric_alarm" "cost_guard_rejections" {
  alarm_name          = "${var.project_name}-cost-guard-rejections"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "CostGuardRejections"
  namespace           = "InspectIQ"
  period              = 60
  statistic           = "Sum"
  threshold           = 1
  alarm_actions       = local.alarm_actions
  treat_missing_data  = "notBreaching"
}

resource "aws_cloudwatch_dashboard" "inspectiq" {
  dashboard_name = "${var.project_name}-ops"
  dashboard_body = jsonencode({
    widgets = [
      {
        type   = "metric"
        x      = 0
        y      = 0
        width  = 12
        height = 6
        properties = {
          title  = "Lambda errors"
          region = var.aws_region
          metrics = [
            ["AWS/Lambda", "Errors", "FunctionName", aws_lambda_function.api.function_name],
            [".", ".", ".", aws_lambda_function.image_worker.function_name],
            [".", ".", ".", aws_lambda_function.operations_projector.function_name]
          ]
          stat   = "Sum"
          period = 60
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 0
        width  = 12
        height = 6
        properties = {
          title  = "API Gateway latency and 5xx"
          region = var.aws_region
          metrics = [
            ["AWS/ApiGateway", "Latency", "ApiId", aws_apigatewayv2_api.http.id, "Stage", aws_apigatewayv2_stage.default.name, { stat = "p95", label = "p95 latency" }],
            [".", "5xx", ".", ".", ".", ".", { stat = "Sum", label = "5xx responses" }]
          ]
          period = 60
          view   = "timeSeries"
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 6
        width  = 12
        height = 6
        properties = {
          title  = "Image analysis queue"
          region = var.aws_region
          metrics = [
            ["AWS/SQS", "ApproximateAgeOfOldestMessage", "QueueName", aws_sqs_queue.image_analysis.name],
            [".", "ApproximateNumberOfMessagesVisible", ".", aws_sqs_queue.image_analysis.name],
            [".", "ApproximateNumberOfMessagesVisible", ".", aws_sqs_queue.image_analysis_dlq.name],
            [".", "ApproximateNumberOfMessagesVisible", ".", aws_sqs_queue.domain_event_dlq.name]
          ]
          stat   = "Maximum"
          period = 60
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 6
        width  = 12
        height = 6
        properties = {
          title  = "Lambda duration and throttles"
          region = var.aws_region
          metrics = [
            ["AWS/Lambda", "Duration", "FunctionName", aws_lambda_function.api.function_name, { stat = "p95", label = "API p95 duration" }],
            [".", ".", ".", aws_lambda_function.image_worker.function_name, { stat = "p95", label = "Worker p95 duration" }],
            [".", "Throttles", ".", aws_lambda_function.api.function_name, { stat = "Sum", label = "API throttles" }],
            [".", ".", ".", aws_lambda_function.image_worker.function_name, { stat = "Sum", label = "Worker throttles" }]
          ]
          period = 60
          view   = "timeSeries"
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 12
        width  = 24
        height = 5
        properties = {
          title  = "Event delivery and AI cost controls"
          region = var.aws_region
          metrics = [
            ["InspectIQ", "PendingOutboxAgeSeconds", { stat = "Maximum", label = "Oldest pending outbox event" }],
            [".", "BedrockThrottles", { stat = "Sum", label = "Bedrock throttles" }],
            [".", "CostGuardRejections", { stat = "Sum", label = "Cost guard rejections" }]
          ]
          period = 60
          view   = "timeSeries"
        }
      }
    ]
  })
}

output "api_endpoint" {
  value = aws_apigatewayv2_api.http.api_endpoint
}

output "image_bucket" {
  value = aws_s3_bucket.vehicle_images.bucket
}

output "image_analysis_queue_url" {
  value = aws_sqs_queue.image_analysis.url
}

output "database_secret_arn" {
  value = aws_secretsmanager_secret.database_url.arn
}

output "domain_event_bus_name" {
  value = aws_cloudwatch_event_bus.domain.name
}

output "operations_table_name" {
  value = aws_dynamodb_table.operations.name
}

output "operations_projector_function_name" {
  value = aws_lambda_function.operations_projector.function_name
}

output "github_deploy_role_arn" {
  value = aws_iam_role.github_deploy.arn
}

output "cognito_user_pool_id" {
  value = aws_cognito_user_pool.inspectiq.id
}

output "cognito_user_pool_client_id" {
  value = aws_cognito_user_pool_client.web.id
}

output "cognito_domain" {
  value = "https://${aws_cognito_user_pool_domain.inspectiq.domain}.auth.${var.aws_region}.amazoncognito.com"
}

output "cognito_issuer" {
  value = "https://cognito-idp.${var.aws_region}.amazonaws.com/${aws_cognito_user_pool.inspectiq.id}"
}
