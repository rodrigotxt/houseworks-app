# Dockerfile
# Usa uma imagem base oficial do Node.js
FROM node:18-alpine

# Define o diretório de trabalho dentro do contêiner
WORKDIR /app

# Copia os arquivos package.json e package-lock.json (se existir)
# para instalar as dependências
COPY package*.json ./

# Instala as dependências do Node.js
RUN npm install

# Copia todo o código-fonte da aplicação para o diretório de trabalho
COPY . .

# Expõe a porta em que o aplicativo Express vai rodar
EXPOSE 3000

# Comando para iniciar a aplicação quando o contêiner for iniciado
CMD [ "npm", "start" ]
