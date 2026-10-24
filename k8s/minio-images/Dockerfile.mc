# MinIO client (mc) image, built inside the workflow run for the same
# reason as Dockerfile.minio: quay.io/minio/mc cannot be pulled
# anonymously (401/503), and docker.io/minio/mc does not exist.
# Built from MinIO's OFFICIAL GitHub release binary (same version the
# chart defaults to), loaded into kind. The chart's post-install job
# runs /bin/sh /config/add-user, which calls `mc` from PATH.
# values-minio.yaml pins pullPolicy: Never. No new accounts, no secrets.
FROM mirror.gcr.io/library/alpine:3.21
COPY mc /usr/local/bin/mc
RUN chmod +x /usr/local/bin/mc
ENTRYPOINT ["mc"]
