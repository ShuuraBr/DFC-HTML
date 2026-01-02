// ARQUIVO: public/script.js
const app = {
    user: null,
    chart: null,

    init: () => {
        app.showLogin();

        const loginForm = document.getElementById('loginForm');
        if(loginForm) loginForm.addEventListener('submit', app.login);

        const btnLogout = document.getElementById('btn-logout');
        if(btnLogout) btnLogout.addEventListener('click', app.logout);

        const formCadastro = document.getElementById('form-cadastro');
        if(formCadastro) formCadastro.addEventListener('submit', app.cadastrarUsuario);
        
        const formReset = document.getElementById('form-reset');
        if(formReset) formReset.addEventListener('submit', app.confirmarResetSenha);

        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                if (btn.id === 'btn-logout' || btn.classList.contains('logout-btn')) return;
                const target = btn.dataset.target;
                if (target) app.switchTab(target);
            });
        });
    },

    setLoading: (show) => {
        const el = document.getElementById('loader');
        if(el) show ? el.classList.remove('hidden') : el.classList.add('hidden');
    },

    showLogin: () => {
        document.getElementById('view-login').classList.remove('hidden');
        document.getElementById('view-app').classList.add('hidden');
        document.getElementById('modal-reset').classList.add('hidden');
        app.user = null;
    },

    login: async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const err = document.getElementById('msg-error');
        
        app.setLoading(true);
        err.innerText = "";
        try {
            const res = await fetch('/api/login', {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ email, password })
            });
            const data = await res.json();
            if (data.success) {
                app.user = data.user;
                document.getElementById('password').value = "";
                if (app.user.Senha_prov) {
                    app.setLoading(false);
                    document.getElementById('view-login').classList.add('hidden');
                    document.getElementById('modal-reset').classList.remove('hidden'); 
                } else { app.showApp(); }
            } else { err.innerText = data.message; }
        } catch (e) { err.innerText = "Erro de conexão."; } 
        finally { if (!app.user || !app.user.Senha_prov) app.setLoading(false); }
    },

    confirmarResetSenha: async (e) => {
        e.preventDefault();
        const s1 = document.getElementById('nova-senha').value;
        const s2 = document.getElementById('confirma-senha').value;
        const msg = document.getElementById('msg-reset');
        if (s1 !== s2) { msg.innerText = "As senhas não coincidem!"; return; }

        app.setLoading(true);
        try {
            const res = await fetch('/api/definir-senha', {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ email: app.user.Email, novaSenha: s1 })
            });
            const data = await res.json();
            if (data.success) {
                alert("Senha atualizada!");
                document.getElementById('modal-reset').classList.add('hidden');
                app.user.Senha_prov = null; app.showApp();
            } else { msg.innerText = data.message; }
        } catch (err) { msg.innerText = "Erro ao atualizar senha."; } 
        finally { app.setLoading(false); }
    },

    showApp: () => {
        document.getElementById('view-login').classList.add('hidden');
        document.getElementById('modal-reset').classList.add('hidden');
        document.getElementById('view-app').classList.remove('hidden');
        
        const nome = app.user.Nome ? app.user.Nome.split(' ')[0] : 'User';
        const depto = app.user.Departamento || 'Geral';
        document.getElementById('user-info').innerText = `${nome} | ${depto}`;
        document.getElementById('user-avatar').innerText = nome.charAt(0).toUpperCase();

        const isAdmin = (app.user.Role === 'admin');
        document.querySelectorAll('.restricted').forEach(el => {
            el.style.setProperty('display', isAdmin ? 'flex' : 'none', 'important');
        });
        if(isAdmin) app.loadDepartamentos();
        app.switchTab('dashboard');
        app.fetchData();
    },

    logout: () => { app.user = null; app.showLogin(); },

    switchTab: (tab) => {
        document.querySelectorAll('.page-section').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.nav-btn').forEach(n => n.classList.remove('active'));
        const targetSection = document.getElementById(`page-${tab}`);
        if(targetSection) targetSection.classList.add('active');
        const btn = document.querySelector(`.nav-btn[data-target="${tab}"]`);
        if(btn) btn.classList.add('active');
    },

    loadDepartamentos: async () => {
        try {
            const res = await fetch('/api/departamentos');
            const deps = await res.json();
            const select = document.getElementById('cad-departamento');
            select.innerHTML = '<option value="">Selecione...</option>';
            deps.forEach(d => { select.innerHTML += `<option value="${d.Id_dep}">${d.Nome_dep}</option>`; });
        } catch (err) { console.error(err); }
    },

    cadastrarUsuario: async (e) => {
        e.preventDefault();
        const msg = document.getElementById('cad-mensagem');
        msg.innerText = "Enviando..."; msg.style.color = "blue";
        const dados = {
            nome: document.getElementById('cad-nome').value,
            email: document.getElementById('cad-email').value,
            departamentoId: document.getElementById('cad-departamento').value,
            role: document.getElementById('cad-role').value
        };
        try {
            const res = await fetch('/api/usuarios', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dados)
            });
            const result = await res.json();
            if (result.success) {
                msg.innerText = "✅ " + result.message; msg.style.color = "green";
                document.getElementById('form-cadastro').reset();
            } else { msg.innerText = "❌ " + result.message; msg.style.color = "red"; }
        } catch (err) { msg.innerText = "Erro ao conectar."; msg.style.color = "red"; }
    },

    fetchData: async () => {
        app.setLoading(true);
        try {
            const res = await fetch('/api/dashboard');
            const data = await res.json();
            if(data.error) throw new Error(data.error);
            app.renderKPIs(data.cards);
            app.renderTable(data.tabela);
            app.renderChart(data.grafico);
        } catch (err) { console.error(err); } 
        finally { app.setLoading(false); }
    },

    renderKPIs: (c) => {
        const fmt = v => new Intl.NumberFormat('pt-BR', {style:'currency', currency:'BRL'}).format(v);
        const ct = document.getElementById('kpi-container');
        const mk = (l, v, cl) => `<div class="card"><div class="card-title">${l}</div><div class="card-value ${cl}">${fmt(v)}</div></div>`;
        ct.innerHTML = mk('Saldo Inicial',c.saldoInicial,'') + mk('Entradas',c.entrada,'text-green') + 
                       mk('Saídas',c.saida,'text-red') + mk('Resultado',c.deficitSuperavit, c.deficitSuperavit>=0?'text-green':'text-red') + 
                       mk('Saldo Final',c.saldoFinal,'bold');
    },

    // --- NOVA LÓGICA DE TABELA COM ACORDEÃO ---
    renderTable: (rows) => {
        const fmt = v => v ? new Intl.NumberFormat('pt-BR', {style:'currency', currency:'BRL'}).format(v) : '-';
        const tbody = document.querySelector('#finance-table tbody');
        
        if(!rows || rows.length===0) { tbody.innerHTML='<tr><td colspan="13">Sem dados</td></tr>'; return; }

        let html = '';

        rows.forEach((row, idx) => {
            const rowId = `grp-${idx}`; // ID único para o grupo
            let trStyle = ''; 
            let tdClass = '';
            let icon = '';
            let clickAction = '';
            let rowClass = '';

            // Estilos baseados no Tipo
            if (row.tipo === 'saldo' || row.tipo === 'info') {
                trStyle = 'background-color: #eff6ff; font-weight: 800; color: #1e3a8a; border-top: 2px solid #bfdbfe;';
            } else if (row.tipo === 'grupo') {
                rowClass = 'hover-row';
                trStyle = 'font-weight: 600; cursor: pointer; background-color: #fff;';
                icon = '<i class="fa-solid fa-chevron-right toggle-icon"></i> ';
                clickAction = `onclick="app.toggleRow('${rowId}', this)"`;
                
                if (row.conta.includes('Entradas')) tdClass = 'text-green';
                if (row.conta.includes('Saídas')) tdClass = 'text-red';
            }

            // Renderiza Linha Pai
            html += `
                <tr style="${trStyle}" class="${rowClass}" ${clickAction}>
                    <td style="text-align:left; padding-left:10px;">${icon}<span class="${tdClass}">${row.conta}</span></td>
                    <td>${fmt(row.jan)}</td><td>${fmt(row.fev)}</td><td>${fmt(row.mar)}</td>
                    <td>${fmt(row.abr)}</td><td>${fmt(row.mai)}</td><td>${fmt(row.jun)}</td>
                    <td>${fmt(row.jul)}</td><td>${fmt(row.ago)}</td><td>${fmt(row.set)}</td>
                    <td>${fmt(row.out)}</td><td>${fmt(row.nov)}</td><td>${fmt(row.dez)}</td>
                </tr>
            `;

            // Renderiza Linhas Filhas (Ocultas)
            if (row.detalhes && row.detalhes.length > 0) {
                row.detalhes.forEach(child => {
                    html += `
                        <tr class="child-row hidden ${rowId}">
                            <td>${child.conta}</td>
                            <td>${fmt(child.jan)}</td><td>${fmt(child.fev)}</td><td>${fmt(child.mar)}</td>
                            <td>${fmt(child.abr)}</td><td>${fmt(child.mai)}</td><td>${fmt(child.jun)}</td>
                            <td>${fmt(child.jul)}</td><td>${fmt(child.ago)}</td><td>${fmt(child.set)}</td>
                            <td>${fmt(child.out)}</td><td>${fmt(child.nov)}</td><td>${fmt(child.dez)}</td>
                        </tr>
                    `;
                });
            }
        });
        tbody.innerHTML = html;
    },

    toggleRow: (id, el) => {
        const children = document.getElementsByClassName(id);
        const isHidden = children[0].classList.contains('hidden');
        
        // Gira ícone
        const icon = el.querySelector('.toggle-icon');
        if(icon) icon.style.transform = isHidden ? 'rotate(90deg)' : 'rotate(0deg)';

        // Mostra/Esconde
        Array.from(children).forEach(row => {
            row.classList.toggle('hidden', !isHidden);
        });
    },

    renderChart: (d) => {
        const ctx = document.getElementById('mainChart').getContext('2d');
        if(app.chart) app.chart.destroy();
        app.chart = new Chart(ctx, {
            type: 'line',
            data: { labels:d.labels, datasets:[{label:'Fluxo', data:d.data, borderColor:'#2563eb', backgroundColor:'rgba(37,99,235,0.1)', fill:true, tension:0.4}] },
            options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{x:{grid:{display:false}}, y:{grid:{borderDash:[5,5]}}} }
        });
    }
};

document.addEventListener('DOMContentLoaded', app.init);