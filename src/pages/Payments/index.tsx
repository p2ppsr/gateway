import React, { useState, useEffect } from 'react';
import authrite from '../../utils/Authrite'
import { submitDirectTransaction } from '@babbage/sdk-ts'
import { getPaymentAddress } from 'sendover'
import { Transaction, P2PKH, PrivateKey, PublicKey } from '@bsv/sdk'

const PaymentsList = () => {
    const [payments, setPayments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [page, setPage] = useState(1);
    const [sortOrder, setSortOrder] = useState('desc');

    const fetchPayments = async () => {
        setLoading(true);
        setError('');
        try {
            const url = `${location.protocol}//${location.host}/api/listPayments?limit=25&offset=${(page - 1) * 25}&sort=${sortOrder}`;
            const response = await authrite.request(url, {
                method: 'GET'
            });
            const data = JSON.parse(
                new TextDecoder().decode(response.body)
            )
            if (data.status === 'error') {
                throw new Error(response.message)
            }
            setPayments(data.data);
        } catch (err) {
            setError(`Fetching payments failed: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    const acknowledgePayment = async (payment) => {
        try {
            const transaction = JSON.parse(payment.transaction_info)
            const derivedPubKey = getPaymentAddress({
                senderPrivateKey: '0000000000000000000000000000000000000000000000000000000000000001',
                recipientPublicKey: payment.merchant_id,
                invoiceNumber: `2-3241645161d8-${payment.payment_id} 1`,
                returnType: 'publicKey'
            })
            const expectedAmount = Math.round(payment.amount * 100000000)

            const pkh = new P2PKH()
            const derivedScript = pkh.lock(PublicKey.fromString(derivedPubKey).toHash()).toHex()
            const bsvtx = Transaction.fromHex(transaction.rawTx)
            const index = bsvtx.outputs.findIndex(x => x.lockingScript.toHex() === derivedScript && x.satoshis === expectedAmount)
            if (index === -1) {
                throw new Error('Could not discover our output of this transaction.')
            }
            const anyonePub = new PrivateKey('0000000000000000000000000000000000000000000000000000000000000001', 'hex').toPublicKey().toDER()
            transaction.outputs = [{
                vout: index,
                satoshis: expectedAmount,
                derivationPrefix: payment.payment_id,
                derivationSuffix: '1',
                senderIdentityKey: anyonePub
            }]

            const success = await submitDirectTransaction({
                protocol: '3241645161d8',
                senderIdentityKey: anyonePub,
                derivationPrefix: payment.payment_id,
                transaction,
                note: 'Receive a payment',
                amount: Math.round(payment.amount * 100000000)
            })
            if (!success.referenceNumber) {
                throw new Error('Unable to submit incoming payment.')
            }
            const response = await authrite.request(`${location.protocol}//${location.host}/api/acknowledgePayment`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ paymentId: payment.payment_id }),
            });
            const data = JSON.parse(
                new TextDecoder().decode(response.body)
            )
            if (data.status === 'error') {
                throw new Error(response.message)
            }
            await fetchPayments(); // Refresh the list to show the updated status
        } catch (err) {
            setError(`Acknowledging payment failed: ${err.message}`);
        }
    };

    useEffect(() => {
        fetchPayments();
    }, [page, sortOrder]);

    if (loading) return <div>Loading...</div>;
    if (error) return <div>Error: {error}</div>;

    return (
        <div>
            <h2>Payments</h2>
            <table>
                <thead>
                    <tr>
                        <th>Payment ID</th>
                        <th>Button ID</th>
                        <th>Amount</th>
                        <th>Currency</th>
                        <th>Completed</th>
                        <th>New</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {payments.map((payment) => (
                        <tr key={payment.payment_id}>
                            <td>{payment.payment_id}</td>
                            <td>{payment.button_id}</td>
                            <td>{payment.amount}</td>
                            <td>{payment.currency}</td>
                            <td>{payment.completed ? 'Yes' : 'No'}</td>
                            <td>{payment.is_new ? 'Yes' : 'No'}</td>
                            <td>
                                {payment.is_new && (
                                    <button onClick={() => acknowledgePayment(payment)}>
                                        Acknowledge
                                    </button>
                                )}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
            {payments.length === 0 && <p>No payments found.</p>}
            <div>
                <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}>Previous</button>
                <button onClick={() => setPage(page + 1)}>Next</button>
                <button onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}>
                    Sort Order: {sortOrder.toUpperCase()}
                </button>
            </div>
        </div>
    );
};

export default PaymentsList;
