FROM node:20-alpine
WORKDIR /usr/src/app
RUN apk add --no-cache python3 make g++ fontconfig ttf-dejavu ttf-ubuntu-font-family font-noto-cjk
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 6880
CMD ["node", "polaris.js"]