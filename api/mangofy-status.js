module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Método não permitido.' });
  }

  const { paymentCode } = req.query || {};

  if (!paymentCode) {
    return res.status(400).json({ message: 'paymentCode é obrigatório.' });
  }

  try {
    const fallbackUrl = 'https://checkout.mangofy.com.br/api/v1/payment';
    let paymentUrl = (process.env.MANGOFY_PAYMENT_URL || fallbackUrl).replace(/\/+$/, '');
    const requestOptions = {
      method: 'GET',
      headers: {
        Authorization: process.env.MANGOFY_TOKEN || process.env.MANGOFY_API_KEY,
        'Store-Code': process.env.MANGOFY_STORE_CODE,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      }
    };
    let response = await fetch(`${paymentUrl}/${encodeURIComponent(paymentCode)}`, requestOptions);
    if (response.status === 404 && paymentUrl !== fallbackUrl) {
      paymentUrl = fallbackUrl;
      response = await fetch(`${paymentUrl}/${encodeURIComponent(paymentCode)}`, requestOptions);
    }

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        message: data?.message || 'Erro ao consultar situação do pagamento.',
        details: data
      });
    }

    return res.status(200).json({
      payment_code: data?.payment_code || paymentCode,
      payment_status: data?.payment_status || 'pending'
    });
  } catch (error) {
    console.error('Erro ao consultar status do pagamento:', error);
    return res.status(500).json({ message: 'Erro ao consultar status do pagamento.' });
  }
};
