"""Gunicorn configuration for production"""
import os

bind = "127.0.0.1:5000"
workers = 1
worker_class = "sync"
timeout = 120
keepalive = 5
accesslog = "-"
errorlog = "-"
loglevel = "info"

# Handle reverse proxy headers
forwarded_allow_ips = "*"

