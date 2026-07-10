from pathlib import Path

from diagrams import Cluster, Diagram, Edge
from diagrams.aws.compute import Lambda
from diagrams.aws.database import Dynamodb
from diagrams.aws.integration import EventbridgeCustomEventBusResource, SNS, SQS
from diagrams.aws.management import Cloudwatch
from diagrams.aws.ml import Bedrock
from diagrams.aws.network import APIGateway
from diagrams.aws.security import Cognito, SecretsManager
from diagrams.aws.storage import S3
from diagrams.generic.device import Mobile
from diagrams.onprem.ci import GithubActions
from diagrams.onprem.client import Users
from diagrams.onprem.database import PostgreSQL
from diagrams.onprem.iac import Terraform
from diagrams.onprem.vcs import Github
from diagrams.saas.cdn import Cloudflare


OUTPUT_BASENAME = Path(__file__).with_suffix("")

graph_attr = {
    "bgcolor": "white",
    "pad": "0.35",
    "rankdir": "LR",
    "ranksep": "0.9",
    "nodesep": "0.45",
    "splines": "spline",
    "concentrate": "false",
    "fontname": "Arial",
    "size": "18,10!",
    "ratio": "compress",
    "dpi": "150",
}

node_attr = {
    "fontname": "Arial",
    "fontsize": "10",
    "margin": "0.08",
}

edge_attr = {
    "color": "#536476",
    "fontname": "Arial",
    "fontsize": "8",
    "arrowsize": "0.7",
}


with Diagram(
    "InspectIQ Serverless AWS Architecture",
    filename=str(OUTPUT_BASENAME),
    outformat=["png", "svg"],
    show=False,
    direction="LR",
    graph_attr=graph_attr,
    node_attr=node_attr,
    edge_attr=edge_attr,
):
    users = Users("Inspectors\nReviewers\nAdmins")

    with Cluster("Delivery"):
        github = Github("GitHub")
        actions = GithubActions("GitHub Actions\nCI + approved deploy")
        terraform = Terraform("Terraform\nAWS IaC")

    with Cluster("Client applications", direction="TB"):
        web = Cloudflare("Cloudflare Pages\nReact web")
        mobile = Mobile("Expo / React Native\nmobile app")

    with Cluster("AWS us-east-1"):
        with Cluster("Identity and API"):
            cognito = Cognito("Cognito\nOIDC + groups")
            api_gateway = APIGateway("API Gateway\nHTTP API")
            api_lambda = Lambda("Node.js Lambda API\nJWT + RBAC")
            secret = SecretsManager("Secrets Manager\nNeon URL")

        with Cluster("Evidence and image analysis"):
            image_queue = SQS("SQS\nimage jobs")
            image_worker = Lambda("Node.js Lambda\nimage worker")
            bedrock = Bedrock("Bedrock\nmultimodal")
            images = S3("Private S3\nvehicle evidence")
            image_dlq = SQS("Image-job DLQ")

        with Cluster("Domain events and operations"):
            event_bus = EventbridgeCustomEventBusResource("EventBridge\ndomain bus")
            projector = Lambda("Python 3.12 Lambda\noperations projector")
            operations_table = Dynamodb("DynamoDB on-demand\nidempotency + ops state")
            event_dlq = SQS("Domain-event DLQ")

        with Cluster("Observability"):
            observability = Cloudwatch("CloudWatch + X-Ray\nlogs metrics traces alarms")
            alerts = SNS("SNS\noperator alerts")

    with Cluster("External managed data"):
        postgres = PostgreSQL("Neon Postgres\nauthoritative workflow")

    github >> actions >> terraform
    actions >> Edge(label="Pages deploy") >> web
    terraform >> Edge(style="dashed", label="approved apply", constraint="false") >> api_gateway

    users >> Edge(label="web") >> web
    users >> Edge(label="mobile capture") >> mobile
    [web, mobile] >> Edge(label="OIDC / PKCE") >> cognito
    [web, mobile] >> Edge(label="REST + JWT") >> api_gateway >> api_lambda

    secret >> Edge(label="pooled URL", constraint="false") >> api_lambda
    api_lambda >> Edge(label="row transaction") >> postgres
    api_lambda >> Edge(label="presigned upload", constraint="false") >> images
    api_lambda >> Edge(label="enqueue") >> image_queue >> image_worker >> Edge(label="vision + OCR") >> bedrock
    image_queue >> Edge(label="failed jobs", constraint="false") >> image_dlq
    image_worker >> Edge(label="read evidence", constraint="false") >> images
    image_worker >> Edge(label="validated findings", constraint="false") >> postgres

    [api_lambda, image_worker] >> Edge(label="outbox events") >> event_bus
    event_bus >> Edge(label="versioned events") >> projector >> operations_table
    event_bus >> Edge(label="failed delivery", constraint="false") >> event_dlq
    api_lambda >> Edge(label="usage guard", constraint="false") >> operations_table

    projector >> Edge(label="all Lambda telemetry") >> observability >> Edge(label="alarms") >> alerts
