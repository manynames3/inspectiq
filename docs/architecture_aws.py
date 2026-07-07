from pathlib import Path

from diagrams import Cluster, Diagram, Edge
from diagrams.aws.compute import Lambda
from diagrams.aws.integration import SQS
from diagrams.aws.management import Cloudwatch, CloudwatchAlarm, CloudwatchLogs
from diagrams.aws.ml import Bedrock
from diagrams.aws.network import APIGateway
from diagrams.aws.security import Cognito, SecretsManager
from diagrams.aws.storage import S3
from diagrams.onprem.ci import GithubActions
from diagrams.onprem.client import Users
from diagrams.onprem.database import PostgreSQL
from diagrams.onprem.iac import Terraform
from diagrams.onprem.vcs import Github
from diagrams.saas.cdn import Cloudflare


OUTPUT_BASENAME = Path(__file__).with_suffix("")

graph_attr = {
    "bgcolor": "white",
    "pad": "0.45",
    "rankdir": "LR",
    "ranksep": "1.25",
    "nodesep": "0.7",
    "splines": "spline",
    "concentrate": "false",
    "fontname": "Arial",
}

node_attr = {
    "fontname": "Arial",
    "fontsize": "11",
    "margin": "0.08",
}

edge_attr = {
    "color": "#536476",
    "fontname": "Arial",
    "fontsize": "9",
    "arrowsize": "0.75",
}


with Diagram(
    "InspectIQ AWS Architecture",
    filename=str(OUTPUT_BASENAME),
    outformat=["png", "svg"],
    show=False,
    direction="LR",
    graph_attr=graph_attr,
    node_attr=node_attr,
    edge_attr=edge_attr,
):
    users = Users("Inspectors\nReviewers\nAdmins")

    with Cluster("Frontend (external)"):
        pages = Cloudflare("Cloudflare Pages\nReact/Vite")

    with Cluster("Delivery"):
        github = Github("GitHub repo")
        actions = GithubActions("GitHub Actions\nCI + Pages")
        terraform = Terraform("Terraform\nAWS IaC")

    with Cluster("AWS us-east-1"):
        with Cluster("Identity + API"):
            cognito = Cognito("Cognito\nOIDC + groups")
            api_gateway = APIGateway("API Gateway\nHTTP API + JWT")
            api_lambda = Lambda("Lambda API\nNode/Express")

        with Cluster("Data + Images"):
            secret = SecretsManager("Secrets Manager\nNeon URL")
            images = S3("Private S3\nvehicle images")

        with Cluster("Async Image Analysis"):
            image_queue = SQS("SQS\nimage jobs")
            image_dlq = SQS("SQS DLQ")
            image_worker = Lambda("Lambda worker\nimage analysis")

        with Cluster("AI + Operations"):
            bedrock = Bedrock("Bedrock\nmultimodal")
            operations = Cloudwatch("CloudWatch\nlogs alarms dashboard")

    with Cluster("External Data Service"):
        postgres = PostgreSQL("Neon Postgres\nexternal")

    users >> Edge(label="workbench") >> pages
    pages >> Edge(label="OIDC sign-in") >> cognito
    pages >> Edge(label="REST + JWT") >> api_gateway
    cognito >> Edge(label="JWT authorizer") >> api_gateway
    api_gateway >> api_lambda

    api_lambda >> Edge(label="presigned URLs") >> images
    api_lambda >> Edge(label="workflow rows") >> postgres
    api_lambda >> Edge(label="DB URL") >> secret

    api_lambda >> Edge(label="queue jobs") >> image_queue
    image_queue >> image_worker
    image_queue >> Edge(label="DLQ") >> image_dlq
    image_worker >> Edge(label="read image") >> images
    image_worker >> Edge(label="validated output") >> postgres
    image_worker >> Edge(label="vision") >> bedrock
    api_lambda >> Edge(label="report draft") >> bedrock

    api_lambda >> Edge(label="logs + metrics") >> operations
    image_worker >> Edge(label="logs + metrics") >> operations
    image_queue >> Edge(label="queue health") >> operations

    github >> actions
    actions >> Edge(label="wrangler deploy") >> pages
    actions >> Edge(label="test build validate") >> terraform
    terraform >> Edge(style="dashed", label="manual apply") >> api_gateway
