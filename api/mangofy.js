const PAYMENT_URL = process.env.MANGOFY_PAYMENT_URL || 'https://checkout.mangofy.com.br/api/v1/payment';

function clean(value) {
  return String(value || '').trim();
}

function paymentUrls() {
  const fallback = 'https://checkout.mangofy.com.br/api/v1/payment';
  return Array.from(new Set([
    PAYMENT_URL,
    fallback
  ].filter((url) => url && !/base_url_de_producao/i.test(url))));
}

function deepFind(value, keys) {
  const wanted = new Set(keys.map((key) => key.toLowerCase()));
  const queue = [value];

  while (queue.length) {
    const current = queue.shift();
    if (!current || typeof current !== 'object') continue;
    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }
    for (const [key, item] of Object.entries(current)) {
      if (wanted.has(key.toLowerCase()) && item != null && item !== '') return item;
      if (item && typeof item === 'object') queue.push(item);
    }
  }
  return '';
}

function text(value) {
  return value == null || typeof value === 'object' ? '' : String(value);
}

function parseAmount(value) {
  const normalized = String(value || '')
    .replace(/R\$\s*/i, '')
    .replace(/\./g, '')
    .replace(',', '.');
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ message: 'Método não permitido.' });

  const token = clean(process.env.MANGOFY_TOKEN || process.env.MANGOFY_API_KEY);
  const storeCode = clean(process.env.MANGOFY_STORE_CODE).replace(/^_\s+/, '');
  if (!token || !storeCode) {
    return res.status(500).json({ message: 'Credenciais da MangoFy não configuradas na Vercel.' });
  }

  try {
    const body = req.body || {};
    const paymentAmount = body.valor ? parseAmount(body.valor) : Number(body.payment_amount);
    if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
      return res.status(400).json({ message: 'payment_amount é obrigatório e deve ser maior que zero.' });
    }

    const amountInCents = body.valor ? Math.round(paymentAmount * 100) : Math.round(paymentAmount);
    const type = body.tipo_pagamento === 'billet' ? 'billet' : 'pix';
    const payload = {
      external_code: body.external_code || `PEDIDO_${Date.now()}`,
      payment_method: type,
      payment_format: 'regular',
      installments: 1,
      payment_amount: amountInCents,
      shipping_amount: Number(body.shipping_amount || 0),
      postback_url: body.postback_url || process.env.MANGOFY_POSTBACK_URL || 'https://example.com/webhook',
      items: body.items?.length ? body.items : [{ code: 'produto', name: 'Produto', quantity: 1, price: amountInCents }],
      customer: {
        name: body.name || body.nome || 'Cliente',
        email: body.email || 'cliente@exemplo.com',
        document: String(body.document || body.cpf || '00000000000').replace(/\D/g, ''),
        phone: String(body.phone || '').replace(/\D/g, ''),
        ip: body.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1'
      }
    };
    payload[type] = { expires_in_days: type === 'pix' ? 1 : 3 };

    let response;
    let connectionError;
    for (const url of paymentUrls()) {
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: token,
            'Store-Code': storeCode,
            'Content-Type': 'application/json',
            Accept: 'application/json'
          },
          body: JSON.stringify(payload)
        });
        if (response.status !== 404 || url === 'https://checkout.mangofy.com.br/api/v1/payment') break;
      } catch (error) {
        connectionError = error;
      }
    }
    if (!response) throw connectionError || new Error('Falha de conexão com a MangoFy.');

    const raw = await response.text();
    let data;
    try { data = raw ? JSON.parse(raw) : {}; } catch { data = { raw }; }
    if (!response.ok) {
      return res.status(response.status).json({
        message: data?.message || data?.error || data?.raw || 'Erro ao processar pagamento.',
        details: data
      });
    }

    const paymentCode = text(deepFind(data, ['payment_code', 'id', 'payment_id', 'transaction_id', 'charge_id']));
    const pixText = text(deepFind(data, [
      'pix_qrcode_text', 'pix_copy_paste', 'pixCopyPaste', 'copy_paste',
      'brcode', 'emv', 'payload', 'qrcode', 'qr_code', 'qrCode'
    ]));
    const pixImage = text(deepFind(data, [
      'pix_qrcode_image', 'qr_code_image', 'qrCodeImage', 'qr_image',
      'qrImage', 'qrcode_image', 'encoded_image', 'image_base64', 'base64'
    ]));
    return res.status(200).json({
      status: 'success',
      message: 'Pagamento iniciado',
      payment_code: paymentCode || null,
      payment_status: text(deepFind(data, ['status', 'payment_status'])) || null,
      payment: { id: paymentCode, status: text(deepFind(data, ['status', 'payment_status'])), pix: { pix_qrcode_text: pixText, pix_qrcode_image: pixImage } },
      pix: { pix_qrcode_text: pixText || null, pix_qrcode_image: pixImage || null }
    });
  } catch (error) {
    console.error('Erro ao processar pagamento:', error);
    return res.status(502).json({ message: 'Não foi possível conectar à MangoFy. Verifique a URL da API e as credenciais.' });
  }
};
