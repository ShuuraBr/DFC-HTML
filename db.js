// ARQUIVO: db.js
const sql = require('mssql'); // MUDANÇA 1: Usamos o driver padrão, não o nativo

const config = {
    server: '192.168.3.120',
    port: 1141,
    database: 'DFC',
    
    // MUDANÇA 2: Passamos as credenciais do Windows explicitamente
    // Isso faz o Node simular um login, ignorando que seu PC está fora do domínio
    user: process.env.DB_USER_WIN,      // Seu usuário de rede
    password: process.env.DB_PASS_WIN,  // Sua senha de rede
    domain: process.env.DB_DOMAIN,      // O domínio (ex: OBJETIVA)

    options: {
        encrypt: false, 
        trustServerCertificate: true,
        enableArithAbort: true,
        
        // Importante: Desligamos o trustedConnection automático
        // pois estamos passando user/pass manualmente
        trustedConnection: false 
    },
    connectionTimeout: 20000
};

async function getConnection() {
    try {
        if (sql.globalConnection && sql.globalConnection.connected) {
            return sql.globalConnection;
        }

        console.log(`📡 Conectando via NTLM (Usuário: ${config.domain}\\${config.user})...`);
        const pool = await sql.connect(config);
        sql.globalConnection = pool;
        console.log("✅ CONEXÃO BEM SUCEDIDA!");
        return pool;

    } catch (err) {
        console.error("❌ ERRO DE CONEXÃO:");
        console.error(err.message);
        console.error("DICA: Verifique se o NOME DO DOMÍNIO no .env está correto.");
        throw err;
    }
}

module.exports = { getConnection, sql };