# DCS-5020L Admin Replacement

This project replaces the admin web interface for my IP camera.

# Folders

## Existing

The existing folder contains the original web UI downloaded from the camera, it is useful to have for reference of how problems were originally solved

## camera-control-hub

The camera-control-hub folder contains a user interface. While developing I use npm run dev and interact via the vite dev server. It proxies the server so that CORS doesn't impact

## server

The server folder contains the server.
During dev I run the server via npm start

The server proxies some requests to the camera, but also has some utilities to resolve the motion detection configuration and a file browser for managing and looking at the videos recorded by the camera
