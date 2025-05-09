FROM node:18-alpine

# Install Terraform
RUN apk add --no-cache curl unzip git \
    && curl -fsSL https://releases.hashicorp.com/terraform/1.5.7/terraform_1.5.7_linux_amd64.zip -o terraform.zip \
    && unzip terraform.zip \
    && mv terraform /usr/local/bin/ \
    && rm terraform.zip

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install
RUN npm install -g nodemon

# Copy application code
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Create directory for Terraform workspaces
RUN mkdir -p terraform-workspaces

# Expose port
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
