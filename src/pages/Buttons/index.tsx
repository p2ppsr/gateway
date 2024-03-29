import React, { useState, useEffect } from 'react';
import authrite from '../../utils/Authrite'

const PaymentButtonsList = () => {
    const [buttons, setButtons] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [page, setPage] = useState(1);
    const [sortOrder, setSortOrder] = useState('desc');
    const [usedFilter, setUsedFilter] = useState('all'); // 'used', 'unused', or 'all'

    const fetchButtons = async (page, sortOrder, usedFilter) => {
        setLoading(true);
        setError('');
        try {
            let url = `${location.protocol}//${location.host}/api/listButtons?limit=25&offset=${(page - 1) * 25}&sort=${sortOrder}`;
            if (usedFilter !== 'all') {
                url += `&usage=${usedFilter}`;
            }
            const response = await authrite.request(url, {
                method: 'GET',
                // Include headers as necessary, e.g., for authentication
            });
            const data = JSON.parse(
                new TextDecoder().decode(response.body)
            )
            if (data.status === 'error') {
                throw new Error(response.message)
            }
            setButtons(data.data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchButtons(page, sortOrder, usedFilter);
    }, [page, sortOrder, usedFilter]);

    if (loading) return <div>Loading...</div>;
    if (error) return <div>Error: {error}</div>;

    return (
        <div>
            <h2>Payment Buttons</h2>
            <div>
                <label>
                    Filter by usage:
                    <select value={usedFilter} onChange={(e) => setUsedFilter(e.target.value)}>
                        <option value="all">All</option>
                        <option value="used">Used</option>
                        <option value="unused">Unused</option>
                    </select>
                </label>
            </div>
            <table>
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Amount</th>
                        <th>Currency</th>
                        <th>Variable Amount</th>
                        <th>Multi-use</th>
                        <th>Used</th>
                        <th>Accepts</th>
                        <th>Total Paid</th>
                    </tr>
                </thead>
                <tbody>
                    {buttons.map((button) => (
                        <tr key={button.button_id}>
                            <td>{button.button_id}</td>
                            <td>{button.amount}</td>
                            <td>{button.currency}</td>
                            <td>{button.variable_amount ? 'Yes' : 'No'}</td>
                            <td>{button.multi_use ? 'Yes' : 'No'}</td>
                            <td>{button.used ? 'Yes' : 'No'}</td>
                            <td>{button.accepts}</td>
                            <td>{button.total_paid}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
            {buttons.length === 0 && <p>No payment buttons found.</p>}
            <div>
                <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}>Previous</button>
                <button onClick={() => setPage(page + 1)}>Next</button>
                <button onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}>Sort Order: {sortOrder.toUpperCase()}</button>
            </div>
        </div>
    );
};

export default PaymentButtonsList;
