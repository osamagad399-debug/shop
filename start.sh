#!/usr/bin/env bash
set -e

npm run prisma:migrate
exec node server.js
