# MinIO client (mc) image, built inside the workflow run for the same
# reason as Dockerfile.minio: quay.io/minio/mc cannot be pulled
# anonymously (401/503), and docker.io/minio/mc does not exist.
# Built from MinIO's OFFICIAL GitHub release binary (same version the
# chart defaults to), loaded into kind. The chart's post-install job
# runs /bin/sh /config/add-user, whose scripts hardcode the mc path as
# /usr/bin/mc (MC="/usr/bin/mc --insecure --config-dir ...") — NOT PATH
# lookup. Run #8 proved it: mc at /usr/local/bin/mc made every mc call
# fail ("No such file") and the post-job exited 1 six times while the
# MinIO server itself was 1/1 Running. So the binary MUST live at
# /usr/bin/mc. values-minio.yaml pins pullPolicy: Never.
# No new accounts, no secrets.
FROM mirror.gcr.io/library/alpine:3.21
COPY mc /usr/bin/mc
RUN chmod +x /usr/bin/mc
ENTRYPOINT ["mc"]
