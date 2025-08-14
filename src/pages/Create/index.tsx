/**
 * @file src/pages/Create/index.tsx
 *
 * Create Page — Allows users to configure and generate payment button code.
 *
 * Users can customize the button text, payment amount (fixed or variable in satoshis), spending description, and CSS styles.
 * Once configured, a button is created using the Metanet identity, and corresponding embeddable HTML
 * and script code is displayed, which can be copied for integration into websites.
 *
 * The page also checks for Metanet client presence and provides user feedback via toast notifications.
 * - Calls /api/createButton to register the button and get buttonId for the generated code, triggered by "Generate Button".
 * - Added "Generate Button" to finalize creation before copying, with live preview updates for editing.
 * - For variable payments, flags variableAmount=true with no default amount, leaving the amount fully
 * determined by the customer via pay.js prompt.
 * - Copies both the button HTML and the pay.js script tag as a single block for ease of use.
 * - Does not write to .html files; users manually add code to their webpages.
 * - Copy Code button is always visible, using a static image when disabled to ensure tooltip visibility, switching to an active icon after generation.
 * - Generated HTML includes default text and amount display for visible rendering even without pay.js.
 * - Preview aligns with generated button by defaulting to text-width, with optional data-width override and centering enforced.
 * - UI enhanced with continuous flashing effects with a 1-second period using CSS animations, flashing only the Copy Code icon initially (when disabled), and independent cross-flashing between Generate Button and Copy Code icon during hover.
 * - Variable button preview input field is read-only to prevent merchant interaction.
 * - Added spending description textbox with gap, no helper text, live-updated data-description.
 * - Removed temporary IDs, relying on initializeIds for pre-generated IDs.
 * - Added validation and sanitization for buttonText (max 80 chars).
 * - Added <ToastContainer /> for toast messages to display.
 * - Updated default spending description to "Payment using paymentId: <paymentId>".
 * - Added CSS validation and fallback to last valid customCSS.
 * - Changed toast to warning for invalid CSS, allowing valid code to render.
 * - Removed data-css attribute to eliminate redundancy, relying on <style> tag.
 * - Added debouncing and onBlur validation to prevent continuous toast warnings.
 * - Fixed TypeScript errors in debounce and fetchWithTimeout (04Aug2025_1216 BST).
 * - Updated to send pre-initialized buttonId and paymentId in createButton payload (12Aug2025_0030 BST).
 * - Restored original ID initialization flow with initializeIds (12Aug2025_0130 BST).
 * - Restored copySuccess state to fix TypeScript errors (12Aug2025_0135 BST).
 * - Removed currency references and deprecated accepts/customCSS fields (14Aug2025_0135 BST).
 *
 * Version: v4.8.86 (Updated 14Aug2025_0135 BST to remove currency and deprecated fields)
 */
const F = 'pages/Create';
import React, { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import {
  Typography,
  Container,
  Grid,
  Box,
  InputAdornment,
  Tooltip,
  IconButton,
  RadioGroup,
  FormControlLabel,
  Radio,
  Card,
  Stack,
  Button as MUIButton,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { WalletClient } from '@bsv/sdk';
import { Root, ContentWrap, CenteredHeader, TextFieldStyled } from './style';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { atomDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useTheme } from '@mui/material/styles';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { logWithTimestamp } from '../../utils/logging';
import { CONFIG, MAX_PAYMENT_SATS } from '../../utils/constants';
import { fetchWithTimeout } from '../../utils/general';
import { initializeIds } from '../../utils/initializeIds';
const debounce = (func: (...args: any[]) => void, wait: number) => {
  let timeout: number | null = null;
  return (...args: any[]) => {
    if (timeout !== null) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};
const sanitizeInput = (input: string): string => {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
};
const validateCSS = (css: string): boolean => {
  try {
    const rules = css
      .split('}')
      .map(rule => rule.trim())
      .filter(rule => rule.length > 0);
    for (const rule of rules) {
      const [selectorPart, propertiesPart] = rule.split('{').map(part => part.trim());
      if (!selectorPart || !propertiesPart) return false;
      const properties = propertiesPart
        .split(';')
        .map(prop => prop.trim())
        .filter(prop => prop.length > 0);
      for (const prop of properties) {
        const [key, value] = prop.split(':').map(part => part.trim());
        if (!key || !value) return false;
      }
    }
    return true;
  } catch {
    return false;
  }
};
const extractCSS = (html: string): string => {
  const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/i);
  return styleMatch ? styleMatch[1].trim() : '';
};
const WALLET_ORIGIN = CONFIG.WALLET_ORIGIN;
const wallet = new WalletClient('auto', WALLET_ORIGIN);
interface CodeSnippetProps {
  code: string;
  language: string;
}
interface ButtonResponse {
  status: string;
  message?: string;
  paymentId: string;
  buttonId: string;
}
const CodeSnippet: React.FC<CodeSnippetProps> = ({ code, language }) => {
  const theme = useTheme();
  return (
    <SyntaxHighlighter
      language={language}
      style={theme.palette.mode === 'dark' ? atomDark : oneLight}
      showLineNumbers
      wrapLines
    >
      {code.trim()}
    </SyntaxHighlighter>
  );
};
const Create: React.FC = () => {
  const [buttonText_fixed, setButtonText_fixed] = useState('Pay Now');
  const [buttonText_variable, setButtonText_variable] = useState('Pay Now');
  const [spendingDescription_fixed, setSpendingDescription_fixed] = useState('');
  const [spendingDescription_variable, setSpendingDescription_variable] = useState('');
  const [paymentType, setPaymentType] = useState<'fixed' | 'variable'>('fixed');
  const [fixedSatAmount, setFixedSatAmount] = useState('5');
  const [merchant, setMerchant] = useState('');
  const [buttonID, setButtonID] = useState('');
  const [paymentID, setPaymentID] = useState('');
  const [showCode, setShowCode] = useState(false);
  const [hasMetanet, setHasMetanet] = useState(false);
  const [copySuccess, setCopySuccess] = useState(''); // Restored state
  const theme = useTheme();
  const [customCSS_fixed, setCustomCSS_fixed] = useState(`<style>.gateway-paybutton-fixed {
    border-radius: 2em;
    border: none;
    padding: 0.7em 1em 0.7em 1em;
    min-width: 10em;
    background: linear-gradient(145deg, #8484FA, ${theme.palette.background.default});
    color: ${theme.palette.mode === 'dark' ? '#ffffff' : '#000000'};
    box-shadow: 2px 4px 6px rgba(0, 0, 0, 0.2);
    user-select: none;
    transition: all 0.3s;
    font-weight: bold;
    text-align: center;
  }
  .gateway-paybutton-fixed:hover {
    cursor: pointer;
    box-shadow: 4px 8px 12px rgba(0, 0, 0, 0.3);
    background: linear-gradient(145deg, #ABABFF,${theme.palette.background.paper});
    color: ${theme.palette.mode === 'dark' ? '#ffffff' : '#000000'};
  }
  .gateway-paybutton-fixed.disabled {
    opacity: 0.4;
    background: gray;
    cursor: not-allowed;
    pointer-events: none;
  }</style><div class="gateway-paybutton gateway-paybutton-fixed" data-amount="${MAX_PAYMENT_SATS}">Pay</div>`);
  const [customCSS_variable, setCustomCSS_variable] = useState(`<style>.gateway-paybutton-variable {
    border-radius: 2em;
    border: none;
    padding: 0.7em 1em 0.7em 1em;
    min-width: 10em;
    background: linear-gradient(145deg, #FF6B6B, ${theme.palette.background.paper});
    color: ${theme.palette.mode === 'dark' ? '#ffffff' : '#000000'};
    box-shadow: 2px 4px 6px rgba(0, 0, 0, 0.2);
    user-select: none;
    transition: all 0.3s;
    font-weight: bold;
    text-align: center;
  }
  .gateway-paybutton-variable:hover {
    cursor: pointer;
    box-shadow: 4px 8px 12px rgba(0, 0, 0, 0.3);
    background: linear-gradient(145deg, #FF8787, ${theme.palette.background.default});
    color: ${theme.palette.mode === 'dark' ? '#ffffff' : '#000000'};
  }
  .gateway-paybutton-variable.disabled {
    opacity: 0.4;
    background: gray;
    cursor: not-allowed;
    pointer-events: none;
  }</style><div class="gateway-paybutton gateway-paybutton-variable" data-variable="true">Pay</div>`);
  const [lastValidCSS_fixed, setLastValidCSS_fixed] = useState(extractCSS(customCSS_fixed));
  const [lastValidCSS_variable, setLastValidCSS_variable] = useState(extractCSS(customCSS_variable));
  const [previewCode_fixed, setPreviewCode_fixed] = useState('');
  const [previewCode_variable, setPreviewCode_variable] = useState('');
  const [previewFixedHtml, setPreviewFixedHtml] = useState('');
  const [previewVariableHtml, setPreviewVariableHtml] = useState('');
  const [styleElement_fixed, setStyleElement_fixed] = useState<HTMLStyleElement | null>(null);
  const [styleElement_variable, setStyleElement_variable] = useState<HTMLStyleElement | null>(null);
  const [renderKey, setRenderKey] = useState(0);
  const [isGenerateHovered, setIsGenerateHovered] = useState(false);
  const [isCopyHovered, setIsCopyHovered] = useState(false);
  const generateButtonRef = useRef<HTMLButtonElement>(null);
  const copyIconRef = useRef<HTMLSpanElement | null>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const isMounted = useRef(false);
  const [updateCounter, setUpdateCounter] = useState(0);
  const [isWalletReady, setIsWalletReady] = useState(!!wallet);
  const generatePreviewHtml = useCallback(
    (type: 'fixed' | 'variable', description: string) => {
      logWithTimestamp(
        F,
        'generatePreviewHtml: Starting for type:',
        type,
        'current paymentType:',
        paymentType,
        'isSelected:',
        type === paymentType,
        'description:',
        description
      );
      const text =
        type === 'fixed'
          ? `${sanitizeInput(buttonText_fixed)} ${fixedSatAmount} Sats`
          : sanitizeInput(buttonText_variable);
      const isSelected = type === paymentType;
      const className =
        type === 'fixed'
          ? `gateway-paybutton gateway-paybutton-fixed${isSelected ? '' : ' disabled'}`
          : `gateway-paybutton gateway-paybutton-variable${isSelected ? '' : ' disabled'}`;
      const safeDescription = sanitizeInput(description || `Payment using paymentId: ${paymentID || ''}`);
      const cssToUse =
        type === 'fixed'
          ? validateCSS(extractCSS(customCSS_fixed))
            ? extractCSS(customCSS_fixed)
            : lastValidCSS_fixed
          : validateCSS(extractCSS(customCSS_variable))
            ? extractCSS(customCSS_variable)
            : lastValidCSS_variable;
      let html = '';
      if (type === 'fixed') {
        html = `<div class="${className}" style="width: fit-content; margin: 0 auto; display: block" data-amount="${fixedSatAmount}" data-text="${text}" data-description="${safeDescription}" data-buttonId="${buttonID}" data-paymentId="${paymentID}">${text}</div>`;
        setPreviewFixedHtml(html);
        logWithTimestamp(F, 'generatePreviewHtml: Fixed preview HTML set:', html);
      } else {
        html = `<div class="${className}" style="width: fit-content; margin: 0 auto; display: block" data-text="${text}" data-description="${safeDescription}" data-buttonId="${buttonID}" data-paymentId="${paymentID}">${text} <input type="number" value="" min="1" max="${MAX_PAYMENT_SATS}" style="width: 50px; text-align: center;" readonly /> Sats</div>`;
        setPreviewVariableHtml(html);
        logWithTimestamp(F, 'generatePreviewHtml: Variable preview HTML set:', html);
      }
      logWithTimestamp(F, 'generatePreviewHtml: Completed generation for type:', type);
    },
    [
      paymentType,
      buttonText_fixed,
      buttonText_variable,
      fixedSatAmount,
      paymentID,
      buttonID,
      customCSS_fixed,
      customCSS_variable,
      lastValidCSS_fixed,
      lastValidCSS_variable,
      setPreviewFixedHtml,
      setPreviewVariableHtml,
    ]
  );
  const updatePreviewCodes = useCallback(() => {
    logWithTimestamp(
      F,
      'updatePreviewCodes: Starting update for paymentType:',
      paymentType,
      'merchant:',
      merchant,
      'fixedDescription:',
      spendingDescription_fixed,
      'variableDescription:',
      spendingDescription_variable,
      'buttonID:',
      buttonID,
      'paymentID:',
      paymentID
    );
    const fixedDescription =
      spendingDescription_fixed || `Payment using paymentId: ${paymentID}`;
    const variableDescription =
      spendingDescription_variable || `Payment using paymentId: ${paymentID}`;
    const fixedText = `${buttonText_fixed} ${fixedSatAmount} Sats`;
    const fixedCode = `<style>\n${validateCSS(extractCSS(customCSS_fixed)) ? extractCSS(customCSS_fixed).trim() : lastValidCSS_fixed.trim()}\n</style>\n<div\n class="gateway-paybutton gateway-paybutton-fixed"\n data-merchant="${merchant || 'temp-merchant'}"\n data-buttonId="${buttonID}"\n data-paymentId="${paymentID}"\n data-amount="${fixedSatAmount}"\n data-text="${fixedText}"\n data-description="${fixedDescription}"\n data-width="fit-content"\n data-server="${location.protocol}//${location.host}">${fixedText}</div>`;
    const variableCode = `<style>\n${validateCSS(extractCSS(customCSS_variable)) ? extractCSS(customCSS_variable).trim() : lastValidCSS_variable.trim()}\n</style>\n<div\n class="gateway-paybutton gateway-paybutton-variable"\n data-merchant="${merchant || 'temp-merchant'}"\n data-buttonId="${buttonID}"\n data-paymentId="${paymentID}"\n data-text="${buttonText_variable}"\n data-description="${variableDescription}"\n data-variable="true"\n data-width="fit-content"\n data-server="${location.protocol}//${location.host}">${buttonText_variable} <input type="number" value="" min="1" max="${MAX_PAYMENT_SATS}" style="width: 50px; text-align: center;" readonly /> Sats</div>`;
    logWithTimestamp(
      F,
      'updatePreviewCodes: Generated HTML code - fixed:',
      fixedCode.substring(0, 50) + '...',
      'variable:',
      variableCode.substring(0, 50) + '...'
    );
    setPreviewCode_fixed(fixedCode);
    setPreviewCode_variable(variableCode);
    setUpdateCounter(prev => prev + 1);
    if (styleElement_fixed) {
      styleElement_fixed.textContent = validateCSS(extractCSS(customCSS_fixed))
        ? extractCSS(customCSS_fixed)
        : lastValidCSS_fixed;
      logWithTimestamp(
        F,
        'updatePreviewCodes: Re-applied fixed CSS to style element:',
        (validateCSS(extractCSS(customCSS_fixed)) ? extractCSS(customCSS_fixed) : lastValidCSS_fixed).substring(0, 50) +
          '...'
      );
    }
    if (styleElement_variable) {
      styleElement_variable.textContent = validateCSS(extractCSS(customCSS_variable))
        ? extractCSS(customCSS_variable)
        : lastValidCSS_variable;
      logWithTimestamp(
        F,
        'updatePreviewCodes: Re-applied variable CSS to style element:',
        (validateCSS(extractCSS(customCSS_variable))
          ? extractCSS(customCSS_variable)
          : lastValidCSS_variable
        ).substring(0, 50) + '...'
      );
    }
    generatePreviewHtml('fixed', fixedDescription);
    generatePreviewHtml('variable', variableDescription);
    logWithTimestamp(F, 'updatePreviewCodes: Previews generated for paymentType:', paymentType);
  }, [
    customCSS_fixed,
    customCSS_variable,
    fixedSatAmount,
    merchant,
    buttonText_fixed,
    buttonText_variable,
    spendingDescription_fixed,
    spendingDescription_variable,
    buttonID,
    paymentID,
    paymentType,
    styleElement_fixed,
    styleElement_variable,
    lastValidCSS_fixed,
    lastValidCSS_variable,
    setPreviewCode_fixed,
    setPreviewCode_variable,
    setUpdateCounter,
    generatePreviewHtml,
  ]);
  useEffect(() => {
    logWithTimestamp(F, 'useEffect: Starting initialization process');
    (async () => {
      try {
        const identity = await wallet.getPublicKey({ identityKey: true });
        setMerchant(identity.publicKey);
        setHasMetanet(true);
        logWithTimestamp(F, 'useEffect: Merchant identity fetched:', identity.publicKey);
        logWithTimestamp(F, 'useEffect: Attempting to initialize buttonID');
        await initializeIds('button', wallet, (id) => {
          setButtonID(id);
          logWithTimestamp(F, 'useEffect: ButtonID set to:', id);
        }, () => {
          logWithTimestamp(F, 'useEffect: ButtonID initialization succeeded');
        }, (err) => {
          logWithTimestamp(F, '❌ useEffect: Error initializing buttonID:', err);
        });
        logWithTimestamp(F, 'useEffect: Attempting to initialize paymentID');
        await initializeIds('payment', wallet, (id) => {
          setPaymentID(id);
          logWithTimestamp(F, 'useEffect: PaymentID set to:', id);
          const updatedDescription = `Payment using paymentId: ${id}`;
          setSpendingDescription_fixed(updatedDescription);
          setSpendingDescription_variable(updatedDescription);
        }, () => {
          logWithTimestamp(F, 'useEffect: PaymentID initialization succeeded');
        }, (err) => {
          logWithTimestamp(F, '❌ useEffect: Error initializing paymentID:', err);
        });
        logWithTimestamp(F, 'useEffect: Initialization completed', { buttonID, paymentID });
      } catch (error) {
        logWithTimestamp(F, '❌ useEffect: Error during initialization:', error);
        setHasMetanet(false);
        toast.error('❌ Failed to initialize IDs');
      }
      updatePreviewCodes();
    })();
  }, []);
  useLayoutEffect(() => {
    logWithTimestamp(F, 'useLayoutEffect: Running with hasMetanet:', hasMetanet, 'isMounted:', isMounted.current);
    if (isMounted.current && hasMetanet) {
      if (generateButtonRef.current) {
        generateButtonRef.current.classList.add('preview-flash-generate');
        logWithTimestamp(F, 'useLayoutEffect: Added flashGenerate animation to Generate Button');
      }
    } else if (generateButtonRef.current) {
      generateButtonRef.current.classList.remove('preview-flash-generate');
      logWithTimestamp(F, 'useLayoutEffect: Removed flashGenerate animation from Generate Button');
    }
    isMounted.current = true;
    logWithTimestamp(F, 'useLayoutEffect: Completed, isMounted set to true');
  }, [hasMetanet]);
  useEffect(() => {
    logWithTimestamp(F, 'useEffect: Updating UI for paymentType:', paymentType, 'merchant:', merchant, 'renderKey:', renderKey);
    if (merchant || !hasMetanet) {
      setRenderKey(prev => prev + 1);
      updatePreviewCodes();
    }
  }, [paymentType, merchant, hasMetanet, updatePreviewCodes, customCSS_fixed, customCSS_variable]);
  useEffect(() => {
    const newStyleElement = document.createElement('style');
    newStyleElement.id = 'custom-button-styles-fixed';
    newStyleElement.textContent = validateCSS(extractCSS(customCSS_fixed))
      ? extractCSS(customCSS_fixed)
      : lastValidCSS_fixed;
    document.head.appendChild(newStyleElement);
    setStyleElement_fixed(newStyleElement);
    logWithTimestamp(
      F,
      'useEffect: Applied fixed CSS to document head:',
      (validateCSS(extractCSS(customCSS_fixed)) ? extractCSS(customCSS_fixed) : lastValidCSS_fixed).substring(0, 50) +
        '...'
    );
    if (previewContainerRef.current) {
      generatePreviewHtml('fixed', spendingDescription_fixed || `Payment using paymentId: ${paymentID || ''}`);
      logWithTimestamp(F, 'useEffect: Generated fixed preview HTML in container');
    }
    return () => {
      if (styleElement_fixed) {
        document.head.removeChild(styleElement_fixed);
        logWithTimestamp(F, 'useEffect: Removed fixed style element from document head');
      }
    };
  }, [customCSS_fixed, lastValidCSS_fixed, paymentID]);
  useEffect(() => {
    const newStyleElement = document.createElement('style');
    newStyleElement.id = 'custom-button-styles-variable';
    newStyleElement.textContent = validateCSS(extractCSS(customCSS_variable))
      ? extractCSS(customCSS_variable)
      : lastValidCSS_variable;
    document.head.appendChild(newStyleElement);
    setStyleElement_variable(newStyleElement);
    logWithTimestamp(
      F,
      'useEffect: Applied variable CSS to document head:',
      (validateCSS(extractCSS(customCSS_variable)) ? extractCSS(customCSS_variable) : lastValidCSS_variable).substring(
        0,
        50
      ) + '...'
    );
    if (previewContainerRef.current) {
      generatePreviewHtml('variable', spendingDescription_variable || `Payment using paymentId: ${paymentID || ''}`);
      logWithTimestamp(F, 'useEffect: Generated variable preview HTML in container');
    }
    return () => {
      if (styleElement_variable) {
        document.head.removeChild(styleElement_variable);
        logWithTimestamp(F, 'useEffect: Removed variable style element from document head');
      }
    };
  }, [customCSS_variable, lastValidCSS_variable, paymentID]);
  useEffect(() => {
    if (copyIconRef.current && !buttonID) {
      copyIconRef.current.classList.add('preview-flash-copy');
      logWithTimestamp(F, 'useEffect: Added preview-flash-copy class to Copy Icon for visibility');
    } else if (copyIconRef.current && buttonID) {
      copyIconRef.current.classList.remove('preview-flash-copy');
      logWithTimestamp(F, 'useEffect: Removed preview-flash-copy class from Copy Icon');
    }
    if (previewContainerRef.current) {
      previewContainerRef.current.classList.add('create-page');
      logWithTimestamp(F, 'useEffect: Applied create-page class to preview container for styling');
    }
    updatePreviewCodes();
    logWithTimestamp(F, 'useEffect: Completed effect for buttonID and preview container updates');
  }, [buttonID, previewContainerRef, updatePreviewCodes]);
  useEffect(() => {
    logWithTimestamp(
      F,
      'useEffect: Updating previews for description change - paymentType:',
      paymentType,
      'fixedDescription:',
      spendingDescription_fixed,
      'variableDescription:',
      spendingDescription_variable
    );
    updatePreviewCodes();
    logWithTimestamp(F, 'useEffect: Finished updating previews for description change');
  }, [spendingDescription_fixed, spendingDescription_variable, updatePreviewCodes]);
  const handleCustomCSSChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const value = event.target.value;
    if (paymentType === 'fixed') {
      setCustomCSS_fixed(value);
      if (!validateCSS(extractCSS(value))) {
        toast.warn('⚠️ Invalid CSS syntax detected, preview may not render correctly.');
      } else {
        setLastValidCSS_fixed(extractCSS(value));
      }
      logWithTimestamp(F, 'handleCustomCSSChange: Updated fixed CSS input with value:', value.substring(0, 50) + '...');
    } else {
      setCustomCSS_variable(value);
      if (!validateCSS(extractCSS(value))) {
        toast.warn('⚠️ Invalid CSS syntax detected, preview may not render correctly.');
      } else {
        setLastValidCSS_variable(extractCSS(value));
      }
      logWithTimestamp(F, 'handleCustomCSSChange: Updated variable CSS input with value:', value.substring(0, 50) + '...');
    }
    updatePreviewCodes();
    setUpdateCounter(prev => prev + 1);
    logWithTimestamp(F, 'handleCustomCSSChange: Completed update for paymentType:', paymentType);
  };
  const validateCSSOnBlur = (value: string, type: 'fixed' | 'variable'): void => {
    if (!validateCSS(extractCSS(value))) {
      toast.warn('⚠️ Invalid CSS syntax. Using last valid CSS for generation.');
      if (type === 'fixed') {
        setCustomCSS_fixed(
          `<style>${lastValidCSS_fixed}</style><div class="gateway-paybutton gateway-paybutton-fixed" data-amount="${MAX_PAYMENT_SATS}">Pay</div>`
        );
        logWithTimestamp(
          F,
          'validateCSSOnBlur: Reverted to last valid fixed CSS due to invalid input:',
          lastValidCSS_fixed.substring(0, 50) + '...'
        );
      } else {
        setCustomCSS_variable(
          `<style>${lastValidCSS_variable}</style><div class="gateway-paybutton gateway-paybutton-variable" data-variable="true">Pay</div>`
        );
        logWithTimestamp(
          F,
          'validateCSSOnBlur: Reverted to last valid variable CSS due to invalid input:',
          lastValidCSS_variable.substring(0, 50) + '...'
        );
      }
    } else {
      if (type === 'fixed') {
        setLastValidCSS_fixed(extractCSS(value));
        setCustomCSS_fixed(value);
        logWithTimestamp(
          F,
          'validateCSSOnBlur: Updated last valid fixed CSS with valid input:',
          extractCSS(value).substring(0, 50) + '...'
        );
      } else {
        setLastValidCSS_variable(extractCSS(value));
        setCustomCSS_variable(value);
        logWithTimestamp(
          F,
          'validateCSSOnBlur: Updated last valid variable CSS with valid input:',
          extractCSS(value).substring(0, 50) + '...'
        );
      }
    }
    updatePreviewCodes();
    logWithTimestamp(F, 'validateCSSOnBlur: Completed validation for type:', type);
  };
  const debouncedValidateCSS = debounce(validateCSSOnBlur, 500);
  const handleCustomCSSBlur = (event: React.FocusEvent<HTMLInputElement>): void => {
    const value = event.target.value;
    debouncedValidateCSS(value, paymentType);
    logWithTimestamp(F, 'handleCustomCSSBlur: Triggered debounced validation for paymentType:', paymentType);
  };
  const handleButtonTextChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const { name, value } = event.target;
    if (name === 'buttonText') {
      const sanitizedValue = sanitizeInput(value.slice(0, 80));
      if (value.length > 80) {
        toast.error('❌ Button text must be 80 characters or less');
      }
      if (paymentType === 'fixed') {
        setButtonText_fixed(sanitizedValue);
      } else {
        setButtonText_variable(sanitizedValue);
      }
      logWithTimestamp(
        F,
        'handleButtonTextChange: Updated button text for paymentType:',
        paymentType,
        'value:',
        sanitizedValue
      );
    } else if (name === 'spendingDescription') {
      const sanitizedValue = sanitizeInput(value.slice(0, 80));
      if (value.length > 80) {
        toast.error('❌ Spending description must be 80 characters or less');
      }
      if (paymentType === 'fixed') {
        setSpendingDescription_fixed(sanitizedValue);
      } else {
        setSpendingDescription_variable(sanitizedValue);
      }
      logWithTimestamp(
        F,
        'handleButtonTextChange: Updated spending description for paymentType:',
        paymentType,
        'value:',
        sanitizedValue
      );
    }
    updatePreviewCodes();
    logWithTimestamp(F, 'handleButtonTextChange: Completed update for paymentType:', paymentType);
  };
  const handlePaymentTypeChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    logWithTimestamp(
      F,
      'handlePaymentTypeChange: Before update - current paymentType:',
      paymentType,
      'new value:',
      event.target.value
    );
    const newType = event.target.value as 'fixed' | 'variable';
    setPaymentType(newType);
    setShowCode(false);
    logWithTimestamp(F, 'handlePaymentTypeChange: After update - new paymentType:', newType);
    updatePreviewCodes();
    logWithTimestamp(F, 'handlePaymentTypeChange: Completed update for new paymentType:', newType);
  };
  const handleFixedSatChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const input = event.target.value.replace(/[^0-9]/g, '');
    const satValue = Math.max(1, Math.min(MAX_PAYMENT_SATS, Number(input) || 5));
    setFixedSatAmount(satValue.toString());
    logWithTimestamp(F, 'handleFixedSatChange: Updated to', satValue);
    updatePreviewCodes();
    logWithTimestamp(F, 'handleFixedSatChange: Completed update for fixedSatAmount:', satValue);
  };
  const handleCopyCode = async (): Promise<void> => {
    const cssToUse =
      paymentType === 'fixed'
        ? validateCSS(extractCSS(customCSS_fixed))
          ? extractCSS(customCSS_fixed)
          : lastValidCSS_fixed
        : validateCSS(extractCSS(customCSS_variable))
          ? extractCSS(customCSS_variable)
          : lastValidCSS_variable;
    const codeToCopy =
      paymentType === 'fixed'
        ? `<style>\n${cssToUse.trim()}\n</style>\n<div\n class="gateway-paybutton gateway-paybutton-fixed"\n data-merchant="${merchant || 'temp-merchant'}"\n data-buttonId="${buttonID}"\n data-paymentId="${paymentID}"\n data-amount="${fixedSatAmount}"\n data-text="${buttonText_fixed} ${fixedSatAmount} Sats"\n data-description="${spendingDescription_fixed || `Payment using paymentId: ${paymentID}`}"\n data-width="fit-content"\n data-server="${location.protocol}//${location.host}">${buttonText_fixed} ${fixedSatAmount} Sats</div>`
        : `<style>\n${cssToUse.trim()}\n</style>\n<div\n class="gateway-paybutton gateway-paybutton-variable"\n data-merchant="${merchant || 'temp-merchant'}"\n data-buttonId="${buttonID}"\n data-paymentId="${paymentID}"\n data-text="${buttonText_variable}"\n data-description="${spendingDescription_variable || `Payment using paymentId: ${paymentID}`}"\n data-variable="true"\n data-width="fit-content"\n data-server="${location.protocol}//${location.host}">${buttonText_variable} <input type="number" value="" min="1" max="${MAX_PAYMENT_SATS}" style="width: 50px; text-align: center;" readonly /> Sats</div>`;
    const finalCode = `${codeToCopy}\n<script src="${location.protocol}//${location.host}/pay.js"></script>`;
    logWithTimestamp(F, 'handleCopyCode: Attempting to copy', paymentType, 'code:', finalCode.substring(0, 50) + '...');
    try {
      await navigator.clipboard.writeText(finalCode);
      setCopySuccess('success');
      setTimeout(() => setCopySuccess(''), 2000);
      toast.success('✅ Code copied to clipboard');
      logWithTimestamp(F, 'handleCopyCode: Copied to clipboard successfully');
    } catch (err) {
      setCopySuccess('failed');
      toast.error('❌ Failed to copy code');
      logWithTimestamp(F, 'handleCopyCode: ❌ Failed to copy code:', (err as Error).message);
    }
    logWithTimestamp(F, 'handleCopyCode: Completed copy attempt for paymentType:', paymentType);
  };
  const handleGenerateButton = async () => {
    if (!merchant || !buttonID || !paymentID) {
      toast.error('❌ Merchant identity or IDs not available');
      logWithTimestamp(F, 'handleGenerateButton: Merchant identity or IDs not available', { merchant, buttonID, paymentID });
      return;
    }
    try {
      const description = paymentType === 'fixed' ? spendingDescription_fixed : spendingDescription_variable;
      let htmlCode = paymentType === 'fixed' ? previewCode_fixed : previewCode_variable;
      logWithTimestamp(
        F,
        'handleGenerateButton: Preparing payload with description:',
        { description, htmlCode: htmlCode.substring(0, 50) + '...', buttonID, paymentID }
      );
      // Modify htmlCode to include id attribute set to buttonID
      htmlCode = htmlCode.replace(/<div/, `<div id="${buttonID}"`);
      const payload = {
        variableAmount: paymentType === 'variable',
        multiUse: true,
        description,
        htmlCode, // Use htmlCode directly instead of customCSS
        paymentId: paymentID, // Use confirmed paymentID from state
        buttonId: buttonID, // Use confirmed buttonID from state
        amount: paymentType === 'fixed' ? parseInt(fixedSatAmount) : undefined, // Optional amount for fixed payments
      };
      logWithTimestamp(F, 'handleGenerateButton: Sending payload:', payload);
      const response = await fetchWithTimeout(
        `${location.protocol}//${location.host}/api/createButton`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
        wallet
      );
      const responseText = await response.text();
      logWithTimestamp(F, 'handleGenerateButton: Raw response text:', responseText);
      const data: ButtonResponse = responseText ? JSON.parse(responseText) : {};
      logWithTimestamp(F, 'handleGenerateButton: Parsed response data:', data);
      logWithTimestamp(F, 'handleGenerateButton: Checking condition - status:', data.status, 'paymentId:', data.paymentId, 'buttonId:', data.buttonId);
      if (data.status === 'success' && data.paymentId && data.buttonId) {
        logWithTimestamp(F, 'handleGenerateButton: Condition passed, updating state with buttonId:', data.buttonId, 'and paymentId:', data.paymentId);
        setButtonID(data.buttonId); // Update with server-confirmed buttonId
        setPaymentID(data.paymentId); // Update with server-confirmed paymentId
        const updatedDescription = `Payment using paymentId: ${data.paymentId}`; // Use generated paymentId
        setSpendingDescription_fixed(updatedDescription);
        setSpendingDescription_variable(updatedDescription);
        setShowCode(true);
        toast.success('✅ Button created successfully');
        logWithTimestamp(F, 'handleGenerateButton: Button created with ID:', data.buttonId, 'and paymentId:', data.paymentId);
        // Trigger a buttonCode request with the new paymentId
        const buttonCodeResponse = await fetchWithTimeout(
          `${location.protocol}//${location.host}/api/buttonCode/${data.paymentId}`,
          { method: 'GET' },
          wallet
        );
        const buttonCodeData = await buttonCodeResponse.json();
        logWithTimestamp(F, 'handleGenerateButton: buttonCode response:', buttonCodeData);
        updatePreviewCodes();
      } else {
        logWithTimestamp(F, 'handleGenerateButton: Condition failed - status:', data.status, 'paymentId:', data.paymentId, 'buttonId:', data.buttonId);
        throw new Error(data.message || '❌ Failed to create button due to invalid response');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '❌ Unknown error';
      logWithTimestamp(
        F,
        'handleGenerateButton: ❌ Error caught - message:',
        errorMessage,
        'Error object:',
        err
      );
      toast.error(`❌ Failed to create button: ${errorMessage}`);
    }
    logWithTimestamp(F, 'handleGenerateButton: Completed generation attempt for paymentType:', paymentType);
  };
  return (
    <Root>
      <Container maxWidth="lg" sx={{ ...(useTheme().templates?.page_wrap || {}) }}>
        <ContentWrap>
          <CenteredHeader>
            <Typography variant="h2">Create Your Payment Button</Typography>
            <Typography variant="subtitle1">
              Edit code live in the left panel to update the preview buttons for your site.
            </Typography>
          </CenteredHeader>
          <Grid container spacing={4}>
            <Grid item xs={12} md={7}>
              <Stack spacing={3}>
                <Card>
                  <Typography variant="h3" gutterBottom>
                    Button Details
                  </Typography>
                  <TextFieldStyled
                    label="Button Text"
                    name="buttonText"
                    value={paymentType === 'fixed' ? buttonText_fixed : buttonText_variable}
                    onChange={handleButtonTextChange}
                    fullWidth
                  />
                  <RadioGroup
                    value={paymentType}
                    onChange={handlePaymentTypeChange}
                    sx={{ mt: 2, display: 'flex', flexDirection: 'row' }}
                  >
                    <FormControlLabel value="fixed" control={<Radio />} label="Fixed Amount" />
                    <FormControlLabel value="variable" control={<Radio />} label="Variable Amount" />
                  </RadioGroup>
                  {paymentType === 'fixed' && (
                    <TextFieldStyled
                      label={`Fixed Sat Amount (1-${MAX_PAYMENT_SATS})`}
                      value={fixedSatAmount}
                      onChange={handleFixedSatChange}
                      type="number"
                      fullWidth
                      InputProps={{ startAdornment: <InputAdornment position="start">sat</InputAdornment> }}
                      sx={{ mt: 2 }}
                    />
                  )}
                  <TextFieldStyled
                    label="Spending Description"
                    name="spendingDescription"
                    value={paymentType === 'fixed' ? spendingDescription_fixed : spendingDescription_variable}
                    onChange={handleButtonTextChange}
                    fullWidth
                    sx={{ mt: 2 }}
                  />
                  <Tooltip title="Press to enable copy icon">
                    <span>
                      <MUIButton
                        ref={generateButtonRef}
                        variant="contained"
                        color="primary"
                        onClick={handleGenerateButton}
                        sx={{ mt: 2, ...(isGenerateHovered && { opacity: 0.7, transition: 'opacity 0.3s' }) }}
                        disabled={!merchant || !buttonID || !paymentID}
                        onMouseEnter={() => setIsGenerateHovered(true)}
                        onMouseLeave={() => setIsGenerateHovered(false)}
                      >
                        Generate Button
                      </MUIButton>
                    </span>
                  </Tooltip>
                </Card>
                <Card>
                  <Typography variant="h3" gutterBottom>
                    Custom Styling
                  </Typography>
                  <TextFieldStyled
                    label="Custom CSS"
                    value={paymentType === 'fixed' ? customCSS_fixed : customCSS_variable}
                    onChange={handleCustomCSSChange}
                    onBlur={handleCustomCSSBlur}
                    fullWidth
                    multiline
                  />
                </Card>
              </Stack>
            </Grid>
            <Grid item xs={12} md={5}>
              <Card>
                <Typography
                  variant="h3"
                  gutterBottom
                  component="div"
                  sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  Button Preview
                  <span
                    ref={copyIconRef}
                    onMouseEnter={() => setIsCopyHovered(true)}
                    onMouseLeave={() => setIsCopyHovered(false)}
                  >
                    <Tooltip title={buttonID ? 'Copy Code' : 'Press Generate Button'} arrow>
                      <span>
                        <IconButton
                          onClick={handleCopyCode}
                          disabled={!buttonID}
                          sx={{
                            ...(isCopyHovered && { opacity: 0.7, transition: 'opacity 0.3s' }),
                            ...(isGenerateHovered && { animation: 'flashCopy 1s infinite' }),
                          }}
                        >
                          {copySuccess === 'success' ? <CheckCircleIcon color="success" /> : <ContentCopyIcon />}
                        </IconButton>
                      </span>
                    </Tooltip>
                  </span>
                </Typography>
                {typeof copySuccess === 'string' && copySuccess !== '' && copySuccess === 'failed' && (
                  <Typography color="error">❌ Failed to copy code!</Typography>
                )}
                <Box ref={previewContainerRef}>
                  <Box sx={{ mb: 2 }}>
                    <div key={`fixed-${updateCounter}`} dangerouslySetInnerHTML={{ __html: previewFixedHtml }} />
                  </Box>
                  <Box sx={{ mb: 2 }}>
                    <div key={`variable-${updateCounter}`} dangerouslySetInnerHTML={{ __html: previewVariableHtml }} />
                  </Box>
                </Box>
                <Box>
                  <CodeSnippet
                    key={`code-${updateCounter}-${paymentType === 'fixed' ? previewCode_fixed : previewCode_variable}`}
                    language="html"
                    code={paymentType === 'fixed' ? previewCode_fixed : previewCode_variable}
                  />
                </Box>
                <Typography variant="h3" gutterBottom sx={{ mt: 2 }}>
                  Script for Head Tag
                </Typography>
                <Box>
                  <CodeSnippet
                    language="javascript"
                    code={`<script src="${location.protocol}//${location.host}/pay.js"></script>`}
                  />
                </Box>
              </Card>
            </Grid>
          </Grid>
        </ContentWrap>
      </Container>
      <ToastContainer
        position="top-right"
        autoClose={5000}
        hideProgressBar={false}
        newestOnTop={false}
        closeOnClick
        rtl={false}
        pauseOnHover
        draggable
      />
    </Root>
  );
};
export default Create;
