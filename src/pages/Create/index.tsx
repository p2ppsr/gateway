import React, { useState, useEffect } from 'react'
import { Typography, TextField, Button } from '@mui/material'
import { makeStyles } from '@mui/styles'
import style from './style'
import PayButton from '../../components/PayButton'
import checkForMetaNetClient from '../../utils/checkForMetaNetClient'
import { getPublicKey } from '@babbage/sdk-ts'
import authrite from '../../utils/Authrite'

const useStyles = makeStyles(style, { name: 'Create' })

const Create = () => {
    const [buttonText, setButtonText] = useState('Pay Now')
    const [paymentAmount, setPaymentAmount] = useState('5')
    const [merchant, setMerchant] = useState('')
    const [buttonID, setDButtonID] = useState('s')
    const [showCode, setShowCode] = useState(false)
    const [hasMetaNet, setHasMetaNet] = useState(false)
    const classes = useStyles()

    useEffect(() => {
        (async () => {
            const metaNetClient = await checkForMetaNetClient()
            if (metaNetClient === 0) {
                setHasMetaNet(false)
            } else {
                const identity = await getPublicKey({ identityKey: true })
                setMerchant(identity)
                setHasMetaNet(true)
            }
        })()
    }, [])

    const handleSubmit = async () => {
        if (!hasMetaNet) {
            return alert('Download MetaNet Client!\n\nhttps://projectbabbage.com/metanet-client')
        }
        const createResponse = await authrite.request(
            `${location.protocol}//${location.host}/api/createButton`, {
            method: 'POST',
            body: JSON.stringify({
                amount: Number(paymentAmount),
                currency: 'BSV',
                multiUse: true,
                variableAmount: true,
                accepts: 'BSV'
            })
        }
        )
        const create = JSON.parse(
            new TextDecoder().decode(createResponse.body)
        )
        setDButtonID(create.buttonId)
        setShowCode(true)
    }

    return (
        <div className={classes.content_wrap}>
            <div>
                <Typography variant='h1'>Create Button</Typography>
                <Typography variant='h3'>Button Text</Typography>
                <TextField
                    value={buttonText}
                    onChange={e => {
                        setButtonText(e.target.value)
                        setShowCode(false)
                    }}
                />
                <Typography variant='h3'>Amount BSV</Typography>
                <TextField
                    value={paymentAmount}
                    onChange={e => {
                        setPaymentAmount(e.target.value)
                        setShowCode(false)
                    }}
                    type="number"
                />
                <br />
                <Button
                    onClick={handleSubmit}
                >
                    Generate Code
                </Button>
            </div>
            <div>
                <Typography variant='h2'>Button Preview</Typography>
                <div className={classes.preview_wrap}>
                    <PayButton
                        text={buttonText}
                        amount={Number(paymentAmount)}
                        merchant={merchant}
                        button={buttonID}
                        server={`${location.protocol}//${location.host}`}
                    />
                </div>
                <Typography variant='h2'>Button Code</Typography>
                {showCode ? (
                    <pre className={classes.code_preview}>
                        {`<div
  class="gateway-paybutton"
  data-merchant="${merchant}"
  data-button="${buttonID}"
  data-amount="${paymentAmount}"
  data-currency="BSV"
  data-text="${buttonText}"
  data-server="${location.protocol}//${location.host}"
>
</div>`}
                    </pre>
                ) : (
                    <Typography>
                        Click "Generate Code" to get the HTML code for your website!
                    </Typography>
                )}
                <Typography variant='h2'>Head Tag Script</Typography>
                <pre className={classes.code_preview}>
                    {`<script src="${location.protocol}//${location.host}/pay.js"></script>`}
                </pre>
            </div>
        </div>
    )
}

export default Create
