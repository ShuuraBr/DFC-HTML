const sql = require('mssql/msnodesqlv8');

const config = {
    // 👇 O segredo está aqui: IP , PORTA (Use vírgula!)
    server: '192.168.3.120,1141', 
    
    database: 'DFC',

    driver: 'msnodesqlv8',
    options: {
        trustedConnection: true, // Tenta usar seu login do Windows
        encrypt: false,          // Geralmente false para rede interna
        enableArithAbort: true,
        connectTimeout: 15000    // Aumentei um pouco para 15s para garantir
    }
};

let poolPromise = null;

async function getConnection() {
    if (!poolPromise) {
        console.log(`📡 Conectando em: ${config.server} (Windows Auth)...`);
        
        poolPromise = new sql.ConnectionPool(config)
            .connect()
            .then(pool => {
                console.log('✅ Conectado ao Banco com Sucesso!');
                return pool;
            })
            .catch(err => {
                console.error('❌ FALHA DE CONEXÃO:', err.message);
                
                // Dica extra de erro se falhar no login
                if(err.message.includes('Login failed')) {
                    console.log('⚠️ DICA: Seu usuário Windows pode não ter permissão nesse servidor remoto.');
                }
                
                poolPromise = null;
                throw err;
            });
    }
    return poolPromise;
}

module.exports = { getConnection, sql };