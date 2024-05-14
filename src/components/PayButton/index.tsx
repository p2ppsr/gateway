import React, { useState } from 'react';
import checkForMetaNetClient from '../../utils/checkForMetaNetClient';
import { Authrite } from 'authrite-js';
import { createAction, getNetwork } from '@babbage/sdk-ts';

const authrite = new Authrite();

const PayButton = ({
  text = 'Pay Now',
  amount,
  merchant,
  button,
  currency = 'BSV',
  server,
  loadingtext = 'Loading, please wait...',
}: {
  text?: string,
  amount: number,
  merchant: string,
  button: string,
  currency?: string,
  server: string,
  loadingtext?: string,
}) => {
  const [loading, setLoading] = useState(false);
  const [paid, setPaid] = useState(false);

  const handleClick = async () => {
    try {
      setLoading(true);
      const metaNetClient = await checkForMetaNetClient();
      if (metaNetClient === 0) {
        setLoading(false);
        return alert('Please download MetaNet Client\n\nhttps://projectbabbage.com/metanet-client');
      }
      const statusResponse = await authrite.request(`${server}/api/getStatus`);
      const status = JSON.parse(new TextDecoder().decode(statusResponse.body));
      const metanetNetwork = await getNetwork();
      if (status.network !== metanetNetwork) {
        return alert(`WARNING! This payment server uses ${status.network} but your MetaNet Client is on ${metanetNetwork}!\n\nPlease make sure you are using the correct network.`);
      }
      const invoiceResponse = await authrite.request(`${server}/api/invoice`, {
        method: 'POST',
        body: JSON.stringify({
          merchantId: merchant,
          paymentButtonId: button,
          currency,
          amount: amount
        })
      });
      const invoice = JSON.parse(new TextDecoder().decode(invoiceResponse.body));
      if (invoice.status !== 'success') {
        throw new Error(invoice.message || 'Error requesting invoice');
      }
      const tx = await createAction({
        description: button,
        outputs: invoice.outputs
      });
      const payResponse = await authrite.request(`${server}/api/pay`, {
        method: 'POST',
        body: JSON.stringify({
          paymentId: invoice.paymentId,
          transaction: JSON.stringify(tx)
        })
      });
      const pay = JSON.parse(new TextDecoder().decode(payResponse.body));
      if (pay.status === 'success') {
        setPaid(true);
        console.log('Successful Gateway payment', pay);
      } else {
        throw new Error(pay.message || 'Error submitting payment');
      }
    } catch (e) {
      console.error(e);
      alert(e.message);
    } finally {
      setLoading(false);
    }
  };

  if (!paid) {
    return (
      <button
        className="customCSS"
        onClick={handleClick}
        disabled={loading}
      >
        {loading ? loadingtext : text}
      </button>
    );
  } else {
    return <div>Payment Submitted</div>;
  }
};

export default PayButton;
