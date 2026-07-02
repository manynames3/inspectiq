variable "project_name" {
  type    = string
  default = "inspectiq"
}

variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "private_subnet_ids" {
  type    = list(string)
  default = []
}

