# Terraform State Bootstrap

This one-time stack creates the encrypted, versioned S3 bucket used by the live InspectIQ Terraform backend. It intentionally keeps its own small local state because a backend cannot provision itself.

```bash
terraform -chdir=infra/bootstrap init
terraform -chdir=infra/bootstrap apply
terraform -chdir=infra/terraform init -migrate-state
```
