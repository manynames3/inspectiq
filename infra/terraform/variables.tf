variable "project_name" {
  type    = string
  default = "inspectiq"
}

variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "allowed_web_origins" {
  type = list(string)
  default = [
    "https://inspectiq.pages.dev",
    "https://d2d7ad14.inspectiq.pages.dev"
  ]
}

variable "bedrock_model_id" {
  type    = string
  default = "us.anthropic.claude-sonnet-4-6"
}

variable "enable_cognito_authorizer" {
  type    = bool
  default = true
}

variable "enable_evaluation_mode" {
  type    = bool
  default = true
}

variable "cognito_callback_urls" {
  type = list(string)
  default = [
    "http://localhost:5173",
    "https://inspectiq.pages.dev"
  ]
}

variable "cognito_logout_urls" {
  type = list(string)
  default = [
    "http://localhost:5173",
    "https://inspectiq.pages.dev"
  ]
}
