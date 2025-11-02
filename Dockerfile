FROM node:0.10
WORKDIR /app
COPY package.json ./
COPY . .
RUN npm install
RUN npx cake build
CMD ["tar", "-czf", "-", "js/bolo-bundle.js"]
