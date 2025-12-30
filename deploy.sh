#!/bin/bash
# Deployment script for 5 More Minutes
# Run this on your local machine to build and prepare for deployment

set -e

echo "Building frontend..."
cd frontend
npm run build
cd ..

echo "Build complete! Static files are in backend/static/"
echo ""
echo "To deploy to Raspberry Pi:"
echo "1. Transfer the entire project to the Pi"
echo "2. On the Pi, set up the Python virtual environment"
echo "3. Configure and start the systemd services"
echo "See README.md for detailed instructions."

