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

resource "aws_s3_bucket" "vehicle_images" {
  bucket_prefix = "${var.project_name}-vehicle-images-"
}

resource "aws_s3_bucket_server_side_encryption_configuration" "vehicle_images" {
  bucket = aws_s3_bucket.vehicle_images.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_sqs_queue" "image_analysis" {
  name                       = "${var.project_name}-image-analysis"
  visibility_timeout_seconds = 120
}

resource "aws_sqs_queue" "report_generation" {
  name                       = "${var.project_name}-report-generation"
  visibility_timeout_seconds = 300
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/inspectiq/api"
  retention_in_days = 30
}

resource "aws_cloudwatch_log_group" "workers" {
  name              = "/inspectiq/workers"
  retention_in_days = 30
}

resource "aws_secretsmanager_secret" "app" {
  name_prefix = "${var.project_name}-app-"
}

# Skeleton resources below show intended production shape. Wire code artifacts,
# VPC subnets, container images, and DB credentials per target account.
resource "aws_db_subnet_group" "postgres" {
  name       = "${var.project_name}-postgres"
  subnet_ids = var.private_subnet_ids
}

resource "aws_rds_cluster" "postgres" {
  count                   = length(var.private_subnet_ids) > 0 ? 1 : 0
  cluster_identifier      = "${var.project_name}-postgres"
  engine                  = "aurora-postgresql"
  engine_mode             = "provisioned"
  database_name           = "inspectiq"
  master_username         = "inspectiq"
  manage_master_user_password = true
  db_subnet_group_name    = aws_db_subnet_group.postgres.name
  skip_final_snapshot     = true
}

resource "aws_sfn_state_machine" "report_workflow" {
  name     = "${var.project_name}-report-workflow"
  role_arn = aws_iam_role.step_functions.arn
  definition = jsonencode({
    Comment = "Gather confirmed facts, invoke Bedrock, validate schema, route human review."
    StartAt = "GatherFacts"
    States = {
      GatherFacts = { Type = "Pass", Next = "InvokeBedrock" }
      InvokeBedrock = { Type = "Pass", Next = "ValidateOutput" }
      ValidateOutput = { Type = "Pass", End = true }
    }
  })
}

resource "aws_iam_role" "step_functions" {
  name = "${var.project_name}-sfn-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = { Service = "states.amazonaws.com" }
    }]
  })
}

