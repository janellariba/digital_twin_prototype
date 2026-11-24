"""AI-SUNOG camera node: capture -> YOLO -> send to central server.

One process per camera. Runs on its own (no dashboard needed), on a laptop now
and on a Jetson later. Knows only its own config, the server URL and its key.
"""
