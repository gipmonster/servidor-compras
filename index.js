const express = require('express');
const app = express();
app.use(express.json());

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL;
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY;
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE;

async function interpretarMensagem(mensagem) {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'llama3-8b-8192',
      messages: [{
        role: 'user',
        content: `Você é um assistente que interpreta solicitações de compra de uma empresa.
        
Extraia as informações da mensagem abaixo e retorne SOMENTE um JSON válido, sem explicações.

Setores disponíveis: Comercial, RH, Marketing, Financeiro, Serviço Geral, Diretoria.
Se o setor não for mencionado, use "Geral".

Mensagem: "${mensagem}"

Retorne exatamente neste formato:
{"item": "nome do item", "setor": "nome do setor"}`
      }],
      temperature: 0.1
    })
  });
  const data = await response.json();
  const texto = data.choices[0].message.content.trim();
  return JSON.parse(texto);
}

async function salvarNoSupabase(item, setor, solicitante) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/solicitacoes`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify({ item, setor, solicitante, status: 'pendente' })
  });
  return await response.json();
}

async function enviarMensagemWhatsApp(numero, mensagem) {
  await fetch(`${EVOLUTION_API_URL}/message/sendText/${EVOLUTION_INSTANCE}`, {
    method: 'POST',
    headers: {
      'apikey': EVOLUTION_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      number: numero,
      text: mensagem
    })
  });
}

app.post('/webhook', async (req, res) => {
  try {
    const { data } = req.body;
    
    if (!data || !data.message) return res.json({ ok: true });
    
    const mensagem = data.message.conversation || 
                     data.message.extendedTextMessage?.text || '';
    const numero = data.key?.remoteJid?.replace('@s.whatsapp.net', '');
    const solicitante = data.pushName || numero;

    if (!mensagem || data.key?.fromMe) return res.json({ ok: true });

    const interpretado = await interpretarMensagem(mensagem);
    
    await salvarNoSupabase(interpretado.item, interpretado.setor, solicitante);
    
    await enviarMensagemWhatsApp(numero, 
      `✅ Pedido registrado!\n\n📦 Item: ${interpretado.item}\n🏢 Setor: ${interpretado.setor}\n👤 Solicitante: ${solicitante}\n\nAguardando aprovação.`
    );

    res.json({ ok: true });
  } catch (error) {
    console.error('Erro:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/', (req, res) => res.json({ status: 'servidor rodando' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
