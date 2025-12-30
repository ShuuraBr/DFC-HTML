// ARQUIVO: db.js
require('dotenv').config();
const sql = require('mssql/msnodesqlv8'); // Biblioteca para Autenticação Windows

const config = {
    // Endereço do Servidor
    server: process.env.DB_SERVER, 
    // Porta (Converter para número)
    port: parseInt(process.env.DB_PORT),
    // Nome do Banco
    database: process.env.DB_NAME,
    
    // Isso diz para usar o driver nativo
    driver: 'msnodesqlv8',
    
    // Configurações Extras
    options: {
        trustedConnection: true, // Isso ATIVA a Autenticação do Windows
        encrypt: false,          // Desativa SSL (evita erro de certificado local)
        trustServerCertificate: true,
        enableArithAbort: true
    }
};

async function getConnection() {
    try {
        console.log(`📡 Conectando ao SQL Server em ${config.server}...`);
        
        // Conecta usando o objeto de configuração
        const pool = await sql.connect(config);
        
        console.log("✅ Conexão bem sucedida (Autenticação Windows)!");
        return pool;
    } catch (err) {
        console.error("❌ Erro ao conectar:");
        console.error(err.message);
        console.log("------------------------------------------------");
        console.log("DICA: Se o erro for 'Data source name not found', verifique se o Node é x64 e o Driver ODBC 17 está instalado.");
        throw err;
    }
}

module.exports = { getConnection, sql };