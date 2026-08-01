/**
 * @file src/pages/Money/index.tsx
 *
 * My Money Page — Placeholder for managing fiat withdrawals and profile settings.
 *
 * This component will allow users to withdraw fiat payments to their bank account
 * and manage profile aspects like identity certificate registration.
 * Currently a minimal implementation with commented-out logic for fetching payment buttons.
 */

import React from 'react'

const MyMoney: React.FC = (): JSX.Element => {
  // const [loading, setLoading] = useState(true)
  // const [error, setError] = useState('')
  // const [page, setPage] = useState(1)

  // const fetchButtons = async (page, sortOrder, usedFilter) => {
  //     setLoading(true)
  //     setError('')
  //     try {
  //         let url = `${location.protocol}//${location.host}/api/listButtons?limit=25&offset=${(page - 1) * 25}&sort=${sortOrder}`
  //         if (usedFilter !== 'all') {
  //             url += `&usage=${usedFilter}`
  //         }
  //         const response = await AuthFetch.request(url, {
  //             method: 'GET',
  //             // Include headers as necessary, e.g., for authentication
  //         })
  //         const data = JSON.parse(
  //             new TextDecoder().decode(response.body)
  //         )
  //         if (response.status === 'error') {
  //             throw new Error(`❌ ${response.message}`)
  //         }
  //         setButtons(data.data)
  //     } catch (err) {
  //         setError(err.message)
  //     } finally {
  //         setLoading(false)
  //     }
  // }

  // useEffect(() => {
  //     fetchButtons(page, sortOrder, usedFilter)
  // }, [page, sortOrder, usedFilter])

  // if (loading) return <div>Loading...</div>
  // if (error) return <div>Error: {error}</div>

  return (
    <div>
      <h2>My Money</h2>
      <div>
        <p>
          Here, you'll be able to withdraw any fiat payments into your bank account, and manage other aspects of your
          profile, such as identity certificate registration.
        </p>
      </div>
    </div>
  )
}

export default MyMoney
