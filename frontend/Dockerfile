FROM node:20-alpine AS build

WORKDIR /app

# Force development mode so devDependencies (Vite, etc.) are always installed
# regardless of any NODE_ENV build arg passed by the CI/CD system
ENV NODE_ENV=development

# Install dependencies first for better caching
COPY package.json package-lock.json* ./
RUN npm install

# Copy application source
COPY . .

# Build the production bundle
RUN npm run build

# Production stage - serve with nginx
FROM nginx:alpine

# Copy the built files
COPY --from=build /app/dist /usr/share/nginx/html

# Copy nginx config
COPY --from=build /app/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
