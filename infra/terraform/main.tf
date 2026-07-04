terraform {
  required_version = ">= 1.6.0"
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
  explicit_auth_flows                  = ["ALLOW_USER_SRP_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"]
}

resource "aws_cognito_user_pool_domain" "inspectiq" {
  domain       = "${var.project_name}-${local.public_suffix}"
  user_pool_id = aws_cognito_user_pool.inspectiq.id
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
          "bedrock:InvokeModel",
          "bedrock:InvokeModelWithResponseStream"
        ]
        Resource = local.bedrock_model_resources
      }
    ]
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
      IMAGE_BUCKET                        = aws_s3_bucket.vehicle_images.bucket
      IMAGE_UPLOAD_MODE                   = "presigned"
      IMAGE_ANALYSIS_MODE                 = "queue"
      IMAGE_ANALYSIS_QUEUE_URL            = aws_sqs_queue.image_analysis.url
      VISION_PROVIDER                     = "bedrock"
      REPORT_PROVIDER                     = "bedrock"
      BEDROCK_MODEL_ID                    = var.bedrock_model_id
      WEB_ORIGIN                          = join(",", local.allowed_origins)
      PG_POOL_SIZE                        = "2"
    }
  }

  depends_on = [aws_cloudwatch_log_group.api]
}

resource "aws_lambda_function" "image_worker" {
  function_name                  = local.worker_lambda_name
  role                           = aws_iam_role.lambda.arn
  runtime                        = "nodejs22.x"
  handler                        = "imageWorker.handler"
  filename                       = local.lambda_zip
  source_code_hash               = filebase64sha256(local.lambda_zip)
  timeout                        = 120
  memory_size                    = 1536

  environment {
    variables = {
      NODE_ENV                            = "production"
      AWS_NODEJS_CONNECTION_REUSE_ENABLED = "1"
      PERSISTENCE_MODE                    = "postgres"
      DATABASE_SECRET_ARN                 = aws_secretsmanager_secret.database_url.arn
      DB_SCHEMA_PATH                      = "/var/task/schema.sql"
      IMAGE_BUCKET                        = aws_s3_bucket.vehicle_images.bucket
      IMAGE_UPLOAD_MODE                   = "presigned"
      VISION_PROVIDER                     = "bedrock"
      BEDROCK_MODEL_ID                    = var.bedrock_model_id
      PG_POOL_SIZE                        = "2"
    }
  }

  depends_on = [aws_cloudwatch_log_group.worker]
}

resource "aws_lambda_event_source_mapping" "image_worker" {
  event_source_arn        = aws_sqs_queue.image_analysis.arn
  function_name           = aws_lambda_function.image_worker.arn
  batch_size              = 1
  function_response_types = ["ReportBatchItemFailures"]

  depends_on = [aws_iam_role_policy.lambda_app]
}

resource "aws_apigatewayv2_api" "http" {
  name          = "${var.project_name}-api"
  protocol_type = "HTTP"

  cors_configuration {
    allow_credentials = false
    allow_headers     = ["authorization", "content-type", "x-actor-id", "x-actor-name", "x-actor-role", "x-request-id", "idempotency-key"]
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
  authorization_type = var.enable_cognito_authorizer ? "JWT" : "NONE"
  authorizer_id      = var.enable_cognito_authorizer ? aws_apigatewayv2_authorizer.jwt[0].id : null
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

resource "aws_cloudwatch_metric_alarm" "api_errors" {
  alarm_name          = "${var.project_name}-api-errors"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 60
  statistic           = "Sum"
  threshold           = 1
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
  treat_missing_data  = "notBreaching"
  dimensions = {
    QueueName = aws_sqs_queue.image_analysis_dlq.name
  }
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
            [".", ".", ".", aws_lambda_function.image_worker.function_name]
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
          title  = "Image analysis queue"
          region = var.aws_region
          metrics = [
            ["AWS/SQS", "ApproximateAgeOfOldestMessage", "QueueName", aws_sqs_queue.image_analysis.name],
            [".", "ApproximateNumberOfMessagesVisible", ".", aws_sqs_queue.image_analysis.name],
            [".", "ApproximateNumberOfMessagesVisible", ".", aws_sqs_queue.image_analysis_dlq.name]
          ]
          stat   = "Maximum"
          period = 60
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

output "cognito_user_pool_id" {
  value = aws_cognito_user_pool.inspectiq.id
}

output "cognito_user_pool_client_id" {
  value = aws_cognito_user_pool_client.web.id
}

output "cognito_domain" {
  value = "https://${aws_cognito_user_pool_domain.inspectiq.domain}.auth.${var.aws_region}.amazoncognito.com"
}
