const sendVerificationEmail = async (email, otp) => {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    signal: AbortSignal.timeout(10000),
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to: [email],
      subject: 'Verify your Restaurant & Café Review account',
      text: `Your verification code is ${otp}. It expires in 5 minutes.`,
      html: `<p>Your Restaurant &amp; Café Review verification code is:</p><p style="font-size:28px;font-weight:bold;letter-spacing:6px">${otp}</p><p>This code expires in 5 minutes. If you did not request it, ignore this email.</p>`,
    }),
  });

  if (!response.ok) {
    console.error(`Email provider rejected verification email (HTTP ${response.status})`);
    const body = await response.json().catch(() => ({}));
    const providerMessage = [
      body.message,
      body.error,
      body.name,
    ].filter(value => typeof value === 'string').join(' ');

    if (
      response.status === 403 &&
      /testing emails to your own email|resend\.dev/i.test(providerMessage)
    ) {
      const error = new Error('RESEND_TEST_RECIPIENT_REJECTED');
      error.code = 'RESEND_TEST_RECIPIENT_REJECTED';
      throw error;
    }

    throw new Error('Email delivery failed');
  }
};

module.exports = {sendVerificationEmail};
