import React, { useState, useEffect } from 'react';
import authrite from '../../utils/Authrite'

const MyMoney = () => {
    // const [loading, setLoading] = useState(true);
    // const [error, setError] = useState('');
    // const [page, setPage] = useState(1);

    // const fetchButtons = async (page, sortOrder, usedFilter) => {
    //     setLoading(true);
    //     setError('');
    //     try {
    //         let url = `${location.protocol}//${location.host}/api/listButtons?limit=25&offset=${(page - 1) * 25}&sort=${sortOrder}`;
    //         if (usedFilter !== 'all') {
    //             url += `&usage=${usedFilter}`;
    //         }
    //         const response = await Authrite.request(url, {
    //             method: 'GET',
    //             // Include headers as necessary, e.g., for authentication
    //         });
    //         const data = JSON.parse(
    //             new TextDecoder().decode(response.body)
    //         )
    //         if (response.status === 'error') {
    //             throw new Error(response.message)
    //         }
    //         setButtons(data.data);
    //     } catch (err) {
    //         setError(err.message);
    //     } finally {
    //         setLoading(false);
    //     }
    // };

    // useEffect(() => {
    //     fetchButtons(page, sortOrder, usedFilter);
    // }, [page, sortOrder, usedFilter]);

    // if (loading) return <div>Loading...</div>;
    // if (error) return <div>Error: {error}</div>;

    return (
        <div>
            <h2>My Money</h2>
            <div>
                <p>
                    Here, you'll be able to withdraw any fiat payments into your bank account, and manage other aspects of your profile, such as identity certificate registration.
                </p>
            </div>
        </div>
    );
};

export default MyMoney
