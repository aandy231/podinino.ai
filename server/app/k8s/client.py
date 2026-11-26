import logging
from typing import Optional, Dict, Any, List
from kubernetes import client, config
from kubernetes.client.rest import ApiException

from app.config import settings

logger = logging.getLogger("spinup-service")

class K8sClient:
    def __init__(self):
        self._initialized = False
        self._initialize_client()

    def _initialize_client(self):
        """
        Initializes the Kubernetes client.
        Supports both in-cluster pod environments and local kubeconfig configurations.
        """
        if self._initialized:
            return

        try:
            if settings.KUBERNETES_MODE == "in-cluster":
                logger.info("Initializing in-cluster Kubernetes configuration...")
                config.load_incluster_config()
            else:
                logger.info("Initializing local kubeconfig Kubernetes configuration...")
                config.load_kube_config()
            
            self.core_v1 = client.CoreV1Api()
            self.apps_v1 = client.AppsV1Api()
            self.networking_v1 = client.NetworkingV1Api()
            self._initialized = True
            logger.info("Kubernetes client successfully initialized.")
        except Exception as e:
            logger.critical(f"Failed to initialize Kubernetes client: {e}")
            raise e

    def create_pvc(self, workspace_id: str, namespace: str, storage_size: str) -> str:
        """
        Creates a PersistentVolumeClaim for the workspace.
        """
        pvc_name = f"pvc-{workspace_id}"
        
        # Define PVC Specification
        pvc_spec = client.V1PersistentVolumeClaimSpec(
            access_modes=["ReadWriteOnce"],
            resources=client.V1VolumeResourceRequirements(
                requests={"storage": storage_size}
            )
        )
        
        # Include custom Storage Class if configured
        if settings.STORAGE_CLASS_NAME:
            pvc_spec.storage_class_name = settings.STORAGE_CLASS_NAME

        pvc = client.V1PersistentVolumeClaim(
            api_version="v1",
            kind="PersistentVolumeClaim",
            metadata=client.V1ObjectMeta(
                name=pvc_name,
                labels={"app": "workspace", "workspace-id": workspace_id}
            ),
            spec=pvc_spec
        )

        try:
            logger.info(f"Creating PVC {pvc_name} in namespace {namespace}...")
            self.core_v1.create_namespaced_persistent_volume_claim(
                namespace=namespace,
                body=pvc
            )
            logger.info(f"PVC {pvc_name} created successfully.")
            return pvc_name
        except ApiException as e:
            if e.status == 409: # Already exists
                logger.warning(f"PVC {pvc_name} already exists in namespace {namespace}. Reusing it.")
                return pvc_name
            logger.error(f"Failed to create PVC {pvc_name}: {e}")
            raise e

    def create_deployment(
        self, 
        workspace_id: str, 
        namespace: str, 
        pvc_name: str,
        password: str,
        cpu_request: str = "100m",
        memory_request: str = "256Mi",
        cpu_limit: str = "1000m",
        memory_limit: str = "2Gi",
        github_token: Optional[str] = None,
    ) -> str:
        """
        Creates a Deployment running the claude-code-sandbox service directly.
        """
        deploy_name = f"deploy-{workspace_id}"
        
        # 1. Volume configuration (mounting persistent storage)
        volume = client.V1Volume(
            name="workspace-vol",
            persistent_volume_claim=client.V1PersistentVolumeClaimVolumeSource(
                claim_name=pvc_name
            )
        )
        
        # 2. Environment variables for claude-code-sandbox
        env_vars = [
            client.V1EnvVar(name="WORKSPACE_DIR", value="/workspace"),
            client.V1EnvVar(name="PORT", value="8000"),
            client.V1EnvVar(name="CODE_SERVER_URL", value="http://localhost:8080"),
            client.V1EnvVar(name="DEFAULT_PERMISSION_MODE", value="acceptEdits"),
            client.V1EnvVar(name="DEFAULT_MODEL", value="claude-haiku-5-5"),
            client.V1EnvVar(name="PASSWORD", value=password),
            client.V1EnvVar(name="WORKSPACE_ID", value=workspace_id),
        ]
        
        # Inject Anthropic API Key if configured in settings
        if settings.ANTHROPIC_API_KEY:
            env_vars.append(client.V1EnvVar(name="ANTHROPIC_API_KEY", value=settings.ANTHROPIC_API_KEY))
        
        # Inject GitHub Token if provided (used by git and gh CLI)
        if github_token:
            env_vars.append(client.V1EnvVar(name="GITHUB_TOKEN", value=github_token))
            env_vars.append(client.V1EnvVar(name="GH_TOKEN", value=github_token))
        
        # 3. Main Container running claude-code-sandbox (FastAPI agent + code-server via supervisord)
        image_name = settings.SANDBOX_IMAGE or settings.CODE_SERVER_IMAGE or "docker-claude-code-sandbox:latest"
        
        container = client.V1Container(
            name="claude-code-sandbox",
            image=image_name,
            image_pull_policy="IfNotPresent",
            env=env_vars,
            ports=[
                client.V1ContainerPort(
                    container_port=8000,
                    name="http-agent"
                ),
                client.V1ContainerPort(
                    container_port=8080,
                    name="http-ide"
                )
            ],
            resources=client.V1ResourceRequirements(
                requests={"cpu": cpu_request, "memory": memory_request},
                limits={"cpu": cpu_limit, "memory": memory_limit}
            ),
            volume_mounts=[
                client.V1VolumeMount(
                    name="workspace-vol",
                    mount_path="/workspace"
                )
            ]
        )
        
        # 4. Pod Spec (fs_group 1000 for developer user)
        pod_spec = client.V1PodSpec(
            init_containers=None,
            containers=[container],
            volumes=[volume],
            security_context=client.V1PodSecurityContext(
                fs_group=1000
            )
        )
        
        # 5. Deployment Spec
        deployment_spec = client.V1DeploymentSpec(
            replicas=1,
            selector=client.V1LabelSelector(
                match_labels={"app": "workspace", "workspace-id": workspace_id}
            ),
            template=client.V1PodTemplateSpec(
                metadata=client.V1ObjectMeta(
                    labels={"app": "workspace", "workspace-id": workspace_id}
                ),
                spec=pod_spec
            )
        )
        
        deployment = client.V1Deployment(
            api_version="apps/v1",
            kind="Deployment",
            metadata=client.V1ObjectMeta(
                name=deploy_name,
                labels={"app": "workspace", "workspace-id": workspace_id}
            ),
            spec=deployment_spec
        )

        try:
            logger.info(f"Creating Deployment {deploy_name} in namespace {namespace} (Image: {image_name})...")
            self.apps_v1.create_namespaced_deployment(
                namespace=namespace,
                body=deployment
            )
            logger.info(f"Deployment {deploy_name} created successfully.")
            return deploy_name
        except ApiException as e:
            if e.status == 409:
                logger.warning(f"Deployment {deploy_name} already exists. Replacing it.")
                existing = self.apps_v1.read_namespaced_deployment(name=deploy_name, namespace=namespace)
                deployment.metadata.resource_version = existing.metadata.resource_version
                self.apps_v1.replace_namespaced_deployment(
                    name=deploy_name,
                    namespace=namespace,
                    body=deployment
                )
                return deploy_name
            logger.error(f"Failed to create Deployment {deploy_name}: {e}")
            raise e

    def create_service(self, workspace_id: str, namespace: str) -> str:
        """
        Creates a ClusterIP service exposing both the code-server web IDE (8080)
        and the FastAPI agent service (8000).
        """
        svc_name = f"svc-{workspace_id}"
        
        service_spec = client.V1ServiceSpec(
            selector={"app": "workspace", "workspace-id": workspace_id},
            ports=[
                # Default HTTP port 80 forwards to code-server IDE on 8080
                client.V1ServicePort(
                    port=80,
                    target_port=8080,
                    protocol="TCP",
                    name="http"
                ),
                # Dedicated port for code-server IDE
                client.V1ServicePort(
                    port=8080,
                    target_port=8080,
                    protocol="TCP",
                    name="ide"
                ),
                # Dedicated port for Claude Agent FastAPI API
                client.V1ServicePort(
                    port=8000,
                    target_port=8000,
                    protocol="TCP",
                    name="agent-api"
                )
            ],
            type="ClusterIP"
        )
        
        service = client.V1Service(
            api_version="v1",
            kind="Service",
            metadata=client.V1ObjectMeta(
                name=svc_name,
                labels={"app": "workspace", "workspace-id": workspace_id}
            ),
            spec=service_spec
        )

        try:
            logger.info(f"Creating Service {svc_name} in namespace {namespace}...")
            self.core_v1.create_namespaced_service(
                namespace=namespace,
                body=service
            )
            logger.info(f"Service {svc_name} created successfully.")
            return svc_name
        except ApiException as e:
            if e.status == 409:
                logger.warning(f"Service {svc_name} already exists. Reusing it.")
                return svc_name
            logger.error(f"Failed to create Service {svc_name}: {e}")
            raise e

    def create_ingress(self, workspace_id: str, namespace: str, service_name: str) -> str:
        """
        Creates an Ingress mapping <workspace-id>.<base-domain> to the Service.
        Includes typical annotations for websocket timeouts.
        """
        ing_name = f"ing-{workspace_id}"
        host = f"{workspace_id}.{settings.INGRESS_BASE_DOMAIN}"
        
        # Define standard annotations for nginx ingress
        annotations = {
            "nginx.ingress.kubernetes.io/proxy-body-size": "0",  # Allow uploading large files
            "nginx.ingress.kubernetes.io/proxy-read-timeout": "3600",  # Prevent websocket disconnects
            "nginx.ingress.kubernetes.io/proxy-send-timeout": "3600",
        }
        
        # Construct path rules routing /api and /health to FastAPI Agent (8000) and / to code-server (80)
        api_path = client.V1HTTPIngressPath(
            path="/api",
            path_type="Prefix",
            backend=client.V1IngressBackend(
                service=client.V1IngressServiceBackend(
                    name=service_name,
                    port=client.V1ServiceBackendPort(number=8000)
                )
            )
        )
        health_path = client.V1HTTPIngressPath(
            path="/health",
            path_type="Prefix",
            backend=client.V1IngressBackend(
                service=client.V1IngressServiceBackend(
                    name=service_name,
                    port=client.V1ServiceBackendPort(number=8000)
                )
            )
        )
        root_path = client.V1HTTPIngressPath(
            path="/",
            path_type="Prefix",
            backend=client.V1IngressBackend(
                service=client.V1IngressServiceBackend(
                    name=service_name,
                    port=client.V1ServiceBackendPort(number=80)
                )
            )
        )
        
        ingress_rule = client.V1IngressRule(
            host=host,
            http=client.V1HTTPIngressRuleValue(
                paths=[api_path, health_path, root_path]
            )
        )
        
        ingress_spec = client.V1IngressSpec(
            ingress_class_name=settings.INGRESS_CLASS_NAME,
            rules=[ingress_rule]
        )
        
        # Configure TLS if enabled
        if settings.INGRESS_SSL_ENABLED and settings.INGRESS_TLS_SECRET_NAME:
            ingress_spec.tls = [
                client.V1IngressTLS(
                    hosts=[host],
                    secret_name=settings.INGRESS_TLS_SECRET_NAME
                )
            ]

        ingress = client.V1Ingress(
            api_version="networking.k8s.io/v1",
            kind="Ingress",
            metadata=client.V1ObjectMeta(
                name=ing_name,
                labels={"app": "workspace", "workspace-id": workspace_id},
                annotations=annotations
            ),
            spec=ingress_spec
        )

        try:
            logger.info(f"Creating Ingress {ing_name} in namespace {namespace}...")
            self.networking_v1.create_namespaced_ingress(
                namespace=namespace,
                body=ingress
            )
            logger.info(f"Ingress {ing_name} created successfully.")
            return ing_name
        except ApiException as e:
            if e.status == 409:
                logger.warning(f"Ingress {ing_name} already exists. Replacing it.")
                existing = self.networking_v1.read_namespaced_ingress(name=ing_name, namespace=namespace)
                ingress.metadata.resource_version = existing.metadata.resource_version
                self.networking_v1.replace_namespaced_ingress(
                    name=ing_name,
                    namespace=namespace,
                    body=ingress
                )
                return ing_name
            logger.error(f"Failed to create Ingress {ing_name}: {e}")
            raise e

    def get_workspace_status(self, workspace_id: str, namespace: str) -> Dict[str, Any]:
        """
        Retrieves status of Deployment, PVC, Service, Ingress.
        """
        deploy_name = f"deploy-{workspace_id}"
        base_url = f"http://{workspace_id}.{settings.INGRESS_BASE_DOMAIN}"
        status = {
            "workspace_id": workspace_id,
            "namespace": namespace,
            "status": "Unknown",
            "phase": "Provisioning",
            "pvc_name": f"pvc-{workspace_id}",
            "deployment_name": deploy_name,
            "service_name": f"svc-{workspace_id}",
            "ingress_name": f"ing-{workspace_id}",
            "available_replicas": 0,
            "ready_replicas": 0,
            "workspace_url": base_url,
            "agent_api_url": f"{base_url}/api",
            "code_server_url": base_url
        }
        
        try:
            deploy = self.apps_v1.read_namespaced_deployment(name=deploy_name, namespace=namespace)
            status["available_replicas"] = deploy.status.available_replicas or 0
            status["ready_replicas"] = deploy.status.ready_replicas or 0
            
            if status["ready_replicas"] > 0:
                status["status"] = "Running"
                status["phase"] = "Ready"
            elif status["available_replicas"] > 0:
                status["status"] = "Provisioning"
                status["phase"] = "ContainersStarting"
            else:
                status["status"] = "Provisioning"
                status["phase"] = "PodScheduled"
        except ApiException as e:
            if e.status == 404:
                status["status"] = "NotFound"
                status["phase"] = "NotFound"
            else:
                logger.error(f"Failed to read deployment {deploy_name}: {e}")
                status["status"] = "Error"
                status["phase"] = "Error"
                
        return status

    def delete_workspace(self, workspace_id: str, namespace: str) -> bool:
        """
        Deletes all resources (Deployment, Service, Ingress, PVC) related to the workspace.
        """
        pvc_name = f"pvc-{workspace_id}"
        deploy_name = f"deploy-{workspace_id}"
        svc_name = f"svc-{workspace_id}"
        ing_name = f"ing-{workspace_id}"
        
        errors = []
        
        # 1. Delete Ingress
        try:
            logger.info(f"Deleting Ingress {ing_name} in namespace {namespace}...")
            self.networking_v1.delete_namespaced_ingress(name=ing_name, namespace=namespace)
        except ApiException as e:
            if e.status != 404:
                errors.append(f"Ingress deletion failed: {e}")

        # 2. Delete Service
        try:
            logger.info(f"Deleting Service {svc_name} in namespace {namespace}...")
            self.core_v1.delete_namespaced_service(name=svc_name, namespace=namespace)
        except ApiException as e:
            if e.status != 404:
                errors.append(f"Service deletion failed: {e}")

        # 3. Delete Deployment
        try:
            logger.info(f"Deleting Deployment {deploy_name} in namespace {namespace}...")
            self.apps_v1.delete_namespaced_deployment(name=deploy_name, namespace=namespace)
        except ApiException as e:
            if e.status != 404:
                errors.append(f"Deployment deletion failed: {e}")

        # 4. Delete PVC
        try:
            logger.info(f"Deleting PVC {pvc_name} in namespace {namespace}...")
            self.core_v1.delete_namespaced_persistent_volume_claim(name=pvc_name, namespace=namespace)
        except ApiException as e:
            if e.status != 404:
                errors.append(f"PVC deletion failed: {e}")

        if errors:
            logger.error(f"Errors occurred while deleting workspace {workspace_id}: {errors}")
            raise Exception("; ".join(errors))
            
        logger.info(f"Workspace {workspace_id} successfully deleted.")
        return True

    def list_workspaces(self, namespace: str) -> list:
        """
        Lists all workspaces in the namespace by querying deployments with app=workspace label.
        """
        workspaces = []
        try:
            deployments = self.apps_v1.list_namespaced_deployment(
                namespace=namespace,
                label_selector="app=workspace"
            )
            for deploy in deployments.items:
                workspace_id = deploy.metadata.labels.get("workspace-id")
                if not workspace_id:
                    continue
                try:
                    status_data = self.get_workspace_status(workspace_id=workspace_id, namespace=namespace)
                    workspaces.append(status_data)
                except Exception as status_err:
                    logger.error(f"Error fetching status for workspace {workspace_id}: {status_err}")
        except ApiException as e:
            logger.error(f"Failed to list deployments: {e}")
            raise e
        return workspaces

# Initialize a global k8s client wrapper
k8s_client = None

def get_k8s_client() -> K8sClient:
    global k8s_client
    if k8s_client is None:
        k8s_client = K8sClient()
    return k8s_client
