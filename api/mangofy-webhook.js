module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Método não permitido.' });
  }

  try {
    const payload = req.body || {};

    console.log('Webhook Mangofy recebido:', JSON.stringify(payload));

    const paymentStatus = payload.payment_status;
    const paymentCode = payload.payment_code;
    const externalCode = payload.external_code;

    if (paymentStatus === 'approved') {
      // Aqui você pode salvar no banco, atualizar pedido, disparar e-mail e etc.
      console.log(`Pagamento aprovado: ${paymentCode} | pedido ${externalCode}`);
    }

    return res.status(200).json({ ok: true, received: true });
  } catch (error) {
    console.error('Erro ao processar webhook da Mangofy:', error);
    return res.status(500).json({ ok: false, message: 'Erro no webhook.' });
  }
};
