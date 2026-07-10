variable "project_name" {
  type    = string
  default = "inspectiq"
}

variable "github_repository" {
  type        = string
  default     = "manynames3/inspectiq"
  description = "GitHub owner/repository trusted through the existing account OIDC provider."
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
    "https://inspectiq.pages.dev",
    "inspectiq://auth/callback"
  ]
}

variable "cognito_logout_urls" {
  type = list(string)
  default = [
    "http://localhost:5173",
    "https://inspectiq.pages.dev",
    "inspectiq://auth/logout"
  ]
}

variable "alarm_email" {
  type        = string
  default     = ""
  description = "Optional operator email for alarm and budget notifications. Supply through an uncommitted tfvars file."
}

variable "monthly_budget_usd" {
  type    = number
  default = 50
}

variable "bedrock_monthly_image_limit" {
  type    = number
  default = 250
}

variable "bedrock_monthly_report_limit" {
  type    = number
  default = 50
}
