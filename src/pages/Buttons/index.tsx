/**
 * @file src/pages/Buttons/index.tsx
 *
 * Displays a paginated table of payment buttons created by the user.
 * Each row represents a button, showing ID, amount, currency, and other details.
 * For multi-use buttons, includes a collapsible sub-table of associated payments.
 *
 * - Fetches buttons and their payments from the backend using `authFetch` and the Metanet client
 * - Includes filters for usage (all, used, unused) and client-side sorting by all columns
 * - Implements an empty state with a CTA to create a button
 * - Uses MUI table components with pagination, allowing custom rows per page
 * - Uses `formatBSV` from `utils/general.ts` for amount formatting
 * - Uses `logWithTimestamp` from `utils/logging.ts` for performance logging
 * - Optimizes performance with single initial fetch
 * - Adjusted `useRef` type to `number | null` to fix TS2322
 * - Added `description` and `html_code` columns
 * - Added default sorting by timestamp (desc) (04Aug2025_1101 BST)
 * - Aligned with Payments page schema (13Aug2025_2230 BST)
 * - Added sub-table for payments per button (20Aug2025_2040 BST)
 * - Fixed fetch error for top-level data array and optional payments (20Aug2025_2230 BST)
 * - Added payments array logging to debug sub-table rendering (20Aug2025_2239 BST)
 * - Added sub-table debugging with row logging and fixed total_paid mapping (20Aug2025_2256 BST)
 * - Fixed TS1345 error by separating logWithTimestamp from conditional (20Aug2025_2302 BST)
 * - Removed info icon from Amount(Sats) header and added hover tooltip for zero values (21Aug2025_0045 BST)
 * - Adjusted sub-table UI: no line break for payment/icon, removed Sats column, removed blank row, added sorting (21Aug2025_0100 BST)
 * - Fixed TS7053 and TS2769 errors by refining SortConfig and TableBody typing (21Aug2025_0130 BST)
 * - Fixed TS7053, TS2367, TS2345 errors by aligning sub-table sorting with Payment properties (21Aug2025_0145 BST)
 * - Fixed TS2769 and TS2367 errors by ensuring valid sub-table sorting keys (21Aug2025_0130 BST)
 * - Fixed payment id vertical alignment, updated Sats title, expanded sub-table fields, and adjusted sub-table width (21Aug2025_0900 BST)
 * - Fixed TS2769 and TS2367 errors by correcting sub-table sorting key mismatches (21Aug2025_0900 BST)
 * - Fixed sub-table layout issues: alignment, title, fields, and width (21Aug2025_0915 BST)
 * - Fixed TS2769 and TS2367 errors in sub-table headers (21Aug2025_0930 BST)
 * - Fixed runtime selector syntax error in useLayoutEffect (21Aug2025_1015 BST)
 * - Fixed sub-table to fill main table width with colSpan and full columns (21Aug2025_1030 BST)
 * - Adjusted sub-table background color and removed unnecessary columns (21Aug2025_1100 BST)
 * - Corrected sub-table background to light gray for white text readability (21Aug2025_1115 BST)
 * - Updated sub-table background to #4c4a4aff and fixed description to use payment_id (21Aug2025_1145 BST)
 * - Removed Sats column from sub-table (21Aug2025_1145 BST)
 * - Integrated 'description' column from payments table in sub-table (21Aug2025_1500 BST)
 *
 * Version: v3.95 (Updated 21Aug2025_1500 BST)
 */
const F = 'pages/Buttons';
import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import {
  CircularProgress,
  Container,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  Button,
  Paper,
  Select,
  MenuItem,
  Stack,
  TablePagination,
  IconButton,
  Box,
  Card,
  TextField,
  Tooltip,
  Collapse,
} from '@mui/material';
import { FirstPage, LastPage, ReceiptLong, ExpandMore, ExpandLess } from '@mui/icons-material';
import { WalletClient, AuthFetch } from '@bsv/sdk';
import { useTheme } from '@mui/material/styles';
import { Link } from 'react-router-dom';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { formatId, formatTimestamp } from '../../utils/general';
import { logWithTimestamp } from '../../utils/logging';
import { CONFIG } from '../../utils/constants';
const wallet = new WalletClient('json-api', CONFIG.WALLET_ORIGIN); // Force json-api substrate
const authFetch = new AuthFetch(wallet);

/**
 * Represents a payment button and its associated payments.
 */
interface Button {
  button_id: string;
  amount: number;
  description: string;
  html_code: string;
  variable_amount: boolean;
  multi_use: boolean;
  used: boolean;
  total_paid: number | null;
  created_at: string;
  updated_at: string;
  payment_id: string | null;
  payments: Payment[];
}

interface Payment {
  payment_id: string;
  transaction_id: string;
  amount: number;
  txid: string | null;
  completed: boolean;
  created_at: string;
  description: string | null; // Added to reflect the new column
}

interface ButtonResponse {
  status: string;
  message: string;
  title?: string;
  data: {
    buttonId: string;
    merchantId: string;
    paymentId: string | null;
    amount: number;
    description: string;
    htmlCode: string;
    variableAmount: boolean;
    multiUse: boolean;
    used: boolean;
    totalPaid: number | null;
    createdAt: string;
    updatedAt: string;
    payments?: {
      paymentId: string;
      transactionId: string;
      amount: number;
      txid: string | null;
      completed: boolean;
      createdAt: string;
      description: string | null; // Added to match the payments table
    }[];
  }[];
  total?: number;
}

interface SortConfig {
  key: Exclude<keyof Button, 'payments'> | null;
  direction: 'asc' | 'desc';
}

interface SubTableSortConfig {
  key: 'amount' | 'description' | 'created_at' | 'payment_id' | 'completed' | null; // Explicitly defined
  direction: 'asc' | 'desc';
}

const PaymentButtonsList = () => {
  const [buttons, setButtons] = useState<Button[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(5);
  const [customRowsPerPage, setCustomRowsPerPage] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [usedFilter, setUsedFilter] = useState<'all' | 'used' | 'unused'>('all');
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'created_at', direction: 'desc' });
  const [subTableSortConfig, setSubTableSortConfig] = useState<SubTableSortConfig>({ key: 'created_at', direction: 'desc' });
  const [customOptions, setCustomOptions] = useState<number[]>([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [title, setTitle] = useState<string>('Payment Buttons');
  const [expandedButton, setExpandedButton] = useState<string | null>(null);
  const theme = useTheme();
  const fetchTimeout = useRef<number | null>(null);
  const [hoveredValue, setHoveredValue] = useState<string | null>(null);
  const [clickedValue, setClickedValue] = useState<string | null>(null);
  const [isClicked, setIsClicked] = useState(false);
  const [exitDirection, setExitDirection] = useState<string | null>(null);
  const [lastClickedColumn, setLastClickedColumn] = useState<string | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const columnRefs = useRef<{ [key: string]: HTMLTableCellElement | null }>({
    'Button Id': null,
    'Payment Id': null,
    'HTML Code': null,
  });

  const handleMouseEnter = (fullValue: string, columnName: string, rowIndex: number) => {
    logWithTimestamp(F, 'Mouse enter, fullValue:', fullValue, 'column:', columnName, 'rowIndex:', rowIndex);
    if (!isClicked) {
      setHoveredValue(fullValue);
      const columnCell = document.querySelector(
        `tr:nth-child(${rowIndex + 1}) td:nth-child(${['Button Id', 'Payment Id', 'HTML Code'].indexOf(columnName) + 2})`
      ) as HTMLTableCellElement | null;
      if (columnCell) {
        columnRefs.current[columnName] = columnCell;
      }
    }
  };

  const handleMouseLeave = (e: React.MouseEvent) => {
    logWithTimestamp(F, 'Mouse leave');
    if (tableRef.current && hoveredValue && !isClicked) {
      const tableRect = tableRef.current.getBoundingClientRect();
      const mouseY = e.clientY;
      const mouseX = e.clientX;
      const hoveredColumn = Object.keys(columnRefs.current).find((col) =>
        columnRefs.current[col]?.contains(e.target as Node)
      );
      if (hoveredColumn) {
        const colRect = columnRefs.current[hoveredColumn]!.getBoundingClientRect();
        const isBottomExit = mouseY > colRect.bottom && mouseX >= colRect.left && mouseX <= colRect.right;
        if (
          isBottomExit &&
          (hoveredColumn === 'Button Id' || hoveredColumn === 'Payment Id' || hoveredColumn === 'HTML Code')
        ) {
          setExitDirection('bottom');
        } else {
          setHoveredValue(null);
          setExitDirection(null);
        }
      } else {
        setHoveredValue(null);
        setExitDirection(null);
      }
    }
  };

  const handleClick = (fullValue: string, columnName: string) => {
    logWithTimestamp(F, 'Mouse click, fullValue:', fullValue, 'column:', columnName);
    setHoveredValue(null);
    setIsClicked(true);
    setClickedValue(fullValue);
    setLastClickedColumn(columnName);
    navigator.clipboard.writeText(fullValue).catch((err) =>
      logWithTimestamp(F, 'Failed to copy to clipboard:', err)
    );
  };

  const handleReset = () => {
    logWithTimestamp(F, 'Reset click');
    setClickedValue(null);
    setIsClicked(false);
    setHoveredValue(null);
    setExitDirection(null);
    setLastClickedColumn(null);
  };

const fetchButtons = async () => {
  setLoading(true);
  setButtons([]);
  try {
    const url = `${location.protocol}//${location.host}/api/listButtons?limit=500`;
    logWithTimestamp(F, 'Fetching buttons with URL:', url);
    const response = await authFetch.fetch(url, { method: 'GET' });
    const data: ButtonResponse = await response.json();
    logWithTimestamp(F, 'API response:', JSON.stringify(data));
    if (data.status === 'error') throw new Error(`❌ ${data.message ?? 'Failed to fetch buttons'}`);
    const mappedButtons: Button[] = data.data.map((button) => {
      const payments = button.payments
        ? button.payments.map((payment) => ({
            payment_id: payment.paymentId,
            transaction_id: payment.transactionId,
            amount: payment.amount,
            txid: payment.txid ?? null,
            completed: !!payment.completed,
            created_at: payment.createdAt,
            description: payment.description || `Payment using paymentId: ${formatId(payment.paymentId)}`, // Now type-safe
          }))
        : [];
      logWithTimestamp(F, `Payments for button ${button.buttonId}:`, payments);
      const totalPaid = button.totalPaid !== null && button.totalPaid !== undefined ? button.totalPaid : null;
      logWithTimestamp(F, `Total paid for button ${button.buttonId}:`, totalPaid);
      return {
        button_id: button.buttonId,
        amount: button.variableAmount ? 0 : (button.amount ?? 0),
        description: button.description ?? 'No description',
        html_code: button.htmlCode ?? '<div>Pay Now</div>',
        variable_amount: !!button.variableAmount,
        multi_use: !!button.multiUse,
        used: !!button.used,
        total_paid: totalPaid,
        created_at: button.createdAt,
        updated_at: button.updatedAt,
        payment_id: button.paymentId ?? null,
        payments,
      };
    });
    logWithTimestamp(F, 'Mapped buttons:', JSON.stringify(mappedButtons));
    setTotalRecords(data.total || mappedButtons.length);
    setButtons(mappedButtons);
    setTitle(data.title || 'Payment Buttons');
    logWithTimestamp(F, 'Initial buttons length:', mappedButtons.length);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '❌ Unknown error';
    logWithTimestamp(F, '❌ Error fetching buttons:', message);
    setError(message);
  } finally {
    setLoading(false);
  }
};

  useEffect(() => {
    fetchButtons();
    return () => {
      if (fetchTimeout.current) clearTimeout(fetchTimeout.current);
    };
  }, []);

  useEffect(() => {
    setPage(0);
  }, [usedFilter]);

const requestSort = (
  key: Exclude<keyof Button, 'payments'> | Exclude<keyof Payment, 'transaction_id' | 'txid'> | null,
  isSubTable?: boolean
) => {
  const config = isSubTable ? subTableSortConfig : sortConfig;
  let direction: 'asc' | 'desc' = 'asc';
  if (config.key === key && config.direction === 'asc') {
    direction = 'desc';
  }
  if (isSubTable) {
    // Type guard to ensure key is valid for SubTableSortConfig
    const validSubTableKeys: (keyof Payment)[] = ['amount', 'description', 'created_at', 'payment_id', 'completed'];
    if (key && !validSubTableKeys.includes(key as keyof Payment)) {
      console.warn(`Invalid sub-table sort key: ${key}, defaulting to 'created_at'`);
      setSubTableSortConfig({ key: 'created_at', direction });
    } else {
      setSubTableSortConfig({ key: key as Exclude<keyof Payment, 'transaction_id' | 'txid'> | null, direction });
    }
  } else {
    setSortConfig({ key: key as Exclude<keyof Button, 'payments'> | null, direction });
  }
};

  const handleRowsPerPageChange = (event: React.ChangeEvent<{ value: unknown }>) => {
    const value = event.target.value;
    logWithTimestamp(F, 'Rows per page change:', value, 'Current options:', rowsPerPageOptions.map((opt) => opt.value));
    if (typeof value === 'object' && value !== null && 'value' in value && value.value === 0) {
      setShowCustomInput(true);
    } else {
      const numValue = typeof value === 'number' ? value : (value as any)?.value || 5;
      const isValidOption = rowsPerPageOptions.some((option) => option.value === numValue);
      if (isValidOption) {
        setRowsPerPage(numValue);
        setCustomRowsPerPage('');
        setShowCustomInput(false);
        setPage(0);
      } else {
        setRowsPerPage(5);
        setPage(0);
      }
    }
  };

  const handleCustomRowsPerPageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value.replace(/[^0-9]/g, '');
    setCustomRowsPerPage(value);
  };

  const handleCustomInputComplete = (
    event: React.KeyboardEvent<HTMLDivElement> | React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    if (event.type === 'keypress' && (event as React.KeyboardEvent<HTMLDivElement>).key !== 'Enter') return;
    const numValue = parseInt(customRowsPerPage, 10);
    logWithTimestamp(F, 'Custom rows on complete:', numValue);
    if (isNaN(numValue) || numValue <= 0 || numValue > 500) {
      setRowsPerPage(5);
    } else {
      setRowsPerPage(numValue);
      setCustomOptions((prev) => {
        if (!prev.includes(numValue) && ![5, 10, 25].includes(numValue)) {
          return [...prev, numValue].sort((a, b) => a - b).slice(-3);
        }
        return prev;
      });
    }
    setCustomRowsPerPage('');
    setShowCustomInput(false);
    setPage(0);
  };

  const baseOptions = [
    { value: 5, label: '5' },
    { value: 10, label: '10' },
    { value: 25, label: '25' },
  ];
  const rowsPerPageOptions = [
    { value: 0, label: 'set 1..500' },
    ...baseOptions,
    ...customOptions.map((value) => ({ value, label: value.toString() })),
  ];

  const filteredButtons =
    usedFilter === 'all'
      ? buttons
      : buttons.filter((button) => (usedFilter === 'used' && button.used === true) || (usedFilter === 'unused' && button.used === false));

  const sortedButtons = sortConfig.key
    ? [...filteredButtons].sort((a, b) => {
        let aValue: string | number | Date | boolean | null | undefined = sortConfig.key ? a[sortConfig.key] : undefined;
        let bValue: string | number | Date | boolean | null | undefined = sortConfig.key ? b[sortConfig.key] : undefined;
        if (aValue === null || aValue === undefined) return 1;
        if (bValue === null || bValue === undefined) return -1;
        if (sortConfig.key === 'amount' || sortConfig.key === 'total_paid') {
          aValue = (aValue as number) || 0;
          bValue = (bValue as number) || 0;
          return sortConfig.direction === 'asc'
            ? (aValue as number) - (bValue as number)
            : (bValue as number) - (aValue as number);
        } else if (sortConfig.key === 'variable_amount' || sortConfig.key === 'multi_use' || sortConfig.key === 'used') {
          aValue = (aValue as boolean) ? 1 : 0;
          bValue = (bValue as boolean) ? 1 : 0;
          return sortConfig.direction === 'asc'
            ? (aValue as number) - (bValue as number)
            : (bValue as number) - (aValue as number);
        } else if (sortConfig.key === 'updated_at' || sortConfig.key === 'created_at') {
          aValue = new Date((aValue as string) || '');
          bValue = new Date((bValue as string) || '');
          return sortConfig.direction === 'asc'
            ? (aValue as Date).getTime() - (bValue as Date).getTime()
            : (bValue as Date).getTime() - (aValue as Date).getTime();
        } else {
          aValue = (aValue as string) || '';
          bValue = (bValue as string) || '';
          return sortConfig.direction === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
        }
      })
    : filteredButtons;

  const paginatedButtons = sortedButtons.slice(page * rowsPerPage, (page + 1) * rowsPerPage);

const sortPayments = (payments: Payment[], config: SubTableSortConfig) => {
  if (!config.key) return payments;
  return [...payments].sort((a, b) => {
    let aValue: string | number | Date | boolean | null | undefined = config.key ? a[config.key] : undefined;
    let bValue: string | number | Date | boolean | null | undefined = config.key ? b[config.key] : undefined;
    if (aValue === null || aValue === undefined) return 1;
    if (bValue === null || bValue === undefined) return -1;
    switch (config.key) {
      case 'amount':
        aValue = (aValue as number) || 0;
        bValue = (bValue as number) || 0;
        return config.direction === 'asc' ? (aValue as number) - (bValue as number) : (bValue as number) - (aValue as number);
      case 'completed':
        aValue = (aValue as boolean) ? 1 : 0;
        bValue = (bValue as boolean) ? 1 : 0;
        return config.direction === 'asc' ? (aValue as number) - (bValue as number) : (bValue as number) - (aValue as number);
      case 'created_at':
        aValue = new Date((aValue as string) || '');
        bValue = new Date((bValue as string) || '');
        return config.direction === 'asc'
          ? (aValue as Date).getTime() - (bValue as Date).getTime()
          : (bValue as Date).getTime() - (aValue as Date).getTime();
      case 'payment_id':
      case 'description':
        aValue = (aValue as string) || '';
        bValue = (bValue as string) || '';
        return config.direction === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
      default:
        return 0; // Safe default for invalid cases (shouldn't occur with type guard)
    }
  });
};

  logWithTimestamp(
    F,
    'Paginated buttons length:',
    paginatedButtons.length,
    'Total buttons length:',
    buttons.length,
    'Filtered length:',
    filteredButtons.length,
    'Sorted length:',
    sortedButtons.length,
    'Page:',
    page,
    'Offset:',
    page * rowsPerPage
  );

  useLayoutEffect(() => {
    paginatedButtons.forEach((button, index) => {
      const buttonIdCell = document.querySelector(
        `tr:nth-child(${index * 2 + 1}) td:nth-child(2)`
      ) as HTMLTableCellElement | null;
      const paymentIdCell = document.querySelector(
        `tr:nth-child(${index * 2 + 1}) td:nth-child(3)`
      ) as HTMLTableCellElement | null;
      const htmlCodeCell = document.querySelector(
        `tr:nth-child(${index * 2 + 1}) td:nth-child(10)`
      ) as HTMLTableCellElement | null;
      if (buttonIdCell) columnRefs.current['Button Id'] = buttonIdCell;
      if (paymentIdCell) columnRefs.current['Payment Id'] = paymentIdCell;
      if (htmlCodeCell) columnRefs.current['HTML Code'] = htmlCodeCell;
      logWithTimestamp(F, `Button Id ref assigned: ${!!buttonIdCell}, Payment Id ref: ${!!paymentIdCell}, HTML Code ref: ${!!htmlCodeCell}`);
    });
  }, [paginatedButtons]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }
  if (error !== '') {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '90vh' }}>
        <Typography color="error">❌ Error: {error}</Typography>
      </Box>
    );
  }
  return (
    <Container sx={{ ...(theme.templates?.page_wrap || {}) }}>
      <Box sx={{ textAlign: 'center', marginBottom: theme.spacing(4), marginTop: theme.spacing(5) }}>
        <Typography variant="h2">{title}</Typography>
        <Typography variant="subtitle1">View all the payment buttons you have created</Typography>
      </Box>
      {filteredButtons.length === 0 ? (
        <Card sx={{ maxWidth: 600, margin: 'auto', padding: theme.spacing(4), textAlign: 'center' }}>
          <Stack spacing={3} alignItems="center">
            <ReceiptLong sx={{ fontSize: 60, color: theme.palette.text.secondary }} />
            <Typography variant="h2">No Payment Buttons Yet</Typography>
            <Typography color="text.secondary">
              It looks like you haven’t created any payment buttons. Get started by creating one now!
            </Typography>
            <Button variant="contained" component={Link} to="/" color="primary">
              Create a Button
            </Button>
          </Stack>
        </Card>
      ) : (
        <>
          <Stack direction="row" spacing={2} sx={{ mb: 2, justifyContent: 'flex-end' }}>
            <Select
              value={usedFilter}
              onChange={(e) => setUsedFilter(e.target.value as 'all' | 'used' | 'unused')}
              variant="outlined"
            >
              <MenuItem value="all">All</MenuItem>
              <MenuItem value="used">Used</MenuItem>
              <MenuItem value="unused">Unused</MenuItem>
            </Select>
          </Stack>
          <TableContainer component={Paper} ref={tableRef}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>
                    <Typography
                      component="a"
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        requestSort('created_at');
                      }}
                      sx={{ cursor: 'pointer', textDecoration: 'underline', color: 'inherit', whiteSpace: 'nowrap' }}
                    >
                      Timestamp {sortConfig.key === 'created_at' && (sortConfig.direction === 'asc' ? ' ↑' : ' ↓')}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography
                      component="a"
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        requestSort('button_id');
                      }}
                      sx={{ cursor: 'pointer', textDecoration: 'underline', color: 'inherit', whiteSpace: 'nowrap' }}
                    >
                      Button Id {sortConfig.key === 'button_id' && (sortConfig.direction === 'asc' ? ' ↑' : ' ↓')}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography
                      component="a"
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        requestSort('payment_id');
                      }}
                      sx={{ cursor: 'pointer', textDecoration: 'underline', color: 'inherit', whiteSpace: 'nowrap' }}
                    >
                      Payment Id {sortConfig.key === 'payment_id' && (sortConfig.direction === 'asc' ? ' ↑' : ' ↓')}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography
                      component="a"
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        requestSort('amount');
                      }}
                      sx={{ cursor: 'pointer', textDecoration: 'underline', color: 'inherit', whiteSpace: 'nowrap' }}
                    >
                      Sats {sortConfig.key === 'amount' && (sortConfig.direction === 'asc' ? ' ↑' : ' ↓')}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography
                      component="a"
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        requestSort('variable_amount');
                      }}
                      sx={{ cursor: 'pointer', textDecoration: 'underline', color: 'inherit', whiteSpace: 'nowrap' }}
                    >
                      Variable {sortConfig.key === 'variable_amount' && (sortConfig.direction === 'asc' ? ' ↑' : ' ↓')}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography
                      component="a"
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        requestSort('multi_use');
                      }}
                      sx={{ cursor: 'pointer', textDecoration: 'underline', color: 'inherit', whiteSpace: 'nowrap' }}
                    >
                      Multi-use {sortConfig.key === 'multi_use' && (sortConfig.direction === 'asc' ? ' ↑' : ' ↓')}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography
                      component="a"
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        requestSort('used');
                      }}
                      sx={{ cursor: 'pointer', textDecoration: 'underline', color: 'inherit', whiteSpace: 'nowrap' }}
                    >
                      Used {sortConfig.key === 'used' && (sortConfig.direction === 'asc' ? ' ↑' : ' ↓')}
  </Typography>
</TableCell>
<TableCell>
  <Typography
    component="a"
    href="#"
    onClick={(e) => {
      e.preventDefault();
      requestSort('total_paid');
    }}
    sx={{ cursor: 'pointer', textDecoration: 'underline', color: 'inherit', whiteSpace: 'nowrap' }}
  >
    Total Paid {sortConfig.key === 'total_paid' && (sortConfig.direction === 'asc' ? ' ↑' : ' ↓')}
  </Typography>
</TableCell>
<TableCell>
  <Typography
    component="a"
    href="#"
    onClick={(e) => {
      e.preventDefault();
      requestSort('description');
    }}
    sx={{ cursor: 'pointer', textDecoration: 'underline', color: 'inherit', whiteSpace: 'nowrap' }}
  >
    Description {sortConfig.key === 'description' && (sortConfig.direction === 'asc' ? ' ↑' : ' ↓')}
  </Typography>
</TableCell>
<TableCell>
  <Typography
    component="a"
    href="#"
    onClick={(e) => {
      e.preventDefault();
      requestSort('html_code');
    }}
    sx={{ cursor: 'pointer', textDecoration: 'underline', color: 'inherit', whiteSpace: 'nowrap' }}
  >
    HTML Code {sortConfig.key === 'html_code' && (sortConfig.direction === 'asc' ? ' ↑' : ' ↓')}
  </Typography>
</TableCell>
<TableCell />
</TableRow>
</TableHead>
<TableBody>
{paginatedButtons.map((button, index) => {
  const fullButtonId = button.button_id || '';
  const fullPaymentId = button.payment_id || '';
  const fullHtmlCode = button.html_code || '<div>Pay Now</div>';
  logWithTimestamp(F, `Rendering button ${button.button_id}, multi_use: ${button.multi_use}, payments:`, button.payments);
  return (
    <React.Fragment key={button.button_id || index}>
      <TableRow>
        <TableCell>{formatTimestamp(button.created_at || button.updated_at)}</TableCell>
        <TableCell
          onMouseEnter={() => handleMouseEnter(fullButtonId, 'Button Id', index * 2 + 1)}
          onMouseLeave={handleMouseLeave}
          onClick={() => handleClick(fullButtonId, 'Button Id')}
        >
          {formatId(button.button_id)}
        </TableCell>
        <TableCell
          sx={{ display: 'flex', alignItems: 'center', verticalAlign: 'middle', padding: '6px 0' }}
          onMouseEnter={() => handleMouseEnter(fullPaymentId, 'Payment Id', index * 2 + 1)}
          onMouseLeave={handleMouseLeave}
          onClick={() => handleClick(fullPaymentId, 'Payment Id')}
        >
          {formatId(button.payment_id || '')}
          {button.multi_use && button.payments.length > 0 && (
            <IconButton
              onClick={() => {
                logWithTimestamp(F, `Toggling collapse for button ${button.button_id}, expanded: ${expandedButton === button.button_id ? 'closing' : 'opening'}, current expandedButton: ${expandedButton}`);
                setExpandedButton(expandedButton === button.button_id ? null : button.button_id);
              }}
              sx={{ ml: 1, padding: 0, verticalAlign: 'middle' }}
            >
              {expandedButton === button.button_id ? <ExpandLess /> : <ExpandMore />}
            </IconButton>
          )}
        </TableCell>
        <TableCell
          onMouseEnter={() => button.amount === 0 ? handleMouseEnter('For variable buttons, this is the initial value (0). Check payments for actual amounts paid.', 'Sats', index * 2 + 1) : null}
          onMouseLeave={handleMouseLeave}
          onClick={() => button.amount === 0 ? handleClick('For variable buttons, this is the initial value (0). Check payments for actual amounts paid.', 'Sats') : null}
        >
          {button.amount}
        </TableCell>
        <TableCell>{button.variable_amount ? 'Yes' : 'No'}</TableCell>
        <TableCell>{button.multi_use ? 'Yes' : 'No'}</TableCell>
        <TableCell>{button.used ? 'Yes' : 'No'}</TableCell>
        <TableCell>{button.total_paid !== null ? button.total_paid : 'N/A'}</TableCell>
        <TableCell>{button.description}</TableCell>
        <TableCell
          onMouseEnter={() => handleMouseEnter(fullHtmlCode, 'HTML Code', index * 2 + 1)}
          onMouseLeave={handleMouseLeave}
          onClick={() => handleClick(fullHtmlCode, 'HTML Code')}
        >
          {button.html_code
            ? `${button.html_code.substring(0, 16)}...${button.html_code.slice(-16)}`
            : '<div>Pay Now</div>'}
        </TableCell>
        <TableCell />
      </TableRow>
      {button.multi_use && button.payments.length > 0 && (
        <TableRow>
          <TableCell colSpan={11} sx={{ p: 0 }}>
            <Collapse in={expandedButton === button.button_id} timeout="auto" unmountOnExit>
              <Box sx={{ p: 0, backgroundColor: '#4c4a4aff' }}>
                <Table size="small" sx={{ minWidth: '100%', display: 'table', tableLayout: 'fixed', width: '100%' }}>
                  <TableHead>
                    <TableRow>
                      <TableCell>
                        <Typography
                          component="a"
                          href="#"
                          onClick={(e) => {
                            e.preventDefault();
                            requestSort('created_at', true);
                          }}
                          sx={{ cursor: 'pointer', textDecoration: 'underline', color: 'inherit', whiteSpace: 'nowrap' }}
                        >
                          Timestamp {subTableSortConfig.key === 'created_at' && (subTableSortConfig.direction === 'asc' ? ' ↑' : ' ↓')}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography
                          component="a"
                          href="#"
                          onClick={(e) => {
                            e.preventDefault();
                            requestSort('payment_id', true);
                          }}
                          sx={{ cursor: 'pointer', textDecoration: 'underline', color: 'inherit', whiteSpace: 'nowrap' }}
                        >
                          Payment Id {subTableSortConfig.key === 'payment_id' && (subTableSortConfig.direction === 'asc' ? ' ↑' : ' ↓')}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography
                          component="a"
                          href="#"
                          onClick={(e) => {
                            e.preventDefault();
                            requestSort('completed', true);
                          }}
                          sx={{ cursor: 'pointer', textDecoration: 'underline', color: 'inherit', whiteSpace: 'nowrap' }}
                        >
                          Used {subTableSortConfig.key === 'completed' && (subTableSortConfig.direction === 'asc' ? ' ↑' : ' ↓')}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography
                          component="a"
                          href="#"
                          onClick={(e) => {
                            e.preventDefault();
                            requestSort('description', true);
                          }}
                          sx={{ cursor: 'pointer', textDecoration: 'underline', color: 'inherit', whiteSpace: 'nowrap' }}
                        >
                          Description {subTableSortConfig.key === 'description' && (subTableSortConfig.direction === 'asc' ? ' ↑' : ' ↓')}
                        </Typography>
                      </TableCell>
                      <TableCell>
<Typography
  component="a"
  href="#"
  sx={{ color: 'inherit', whiteSpace: 'nowrap' }} // Remove cursor and underline since it’s not sortable
>
  HTML Code
</Typography>
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {sortPayments(button.payments, subTableSortConfig).map((payment, paymentIndex) => (
                      <TableRow key={`payment-${button.button_id}-${payment.payment_id || paymentIndex}-${paymentIndex}`}>
                        <TableCell>{formatTimestamp(payment.created_at)}</TableCell>
                        <TableCell>{formatId(payment.payment_id)}</TableCell>
                        <TableCell>{payment.completed ? 'Yes' : 'No'}</TableCell>
                        <TableCell>{payment.description || `Payment using paymentId: ${formatId(payment.payment_id)}`}</TableCell>
                        <TableCell
                          onMouseEnter={() => handleMouseEnter(button.html_code || '', 'HTML Code', index * 2 + 1)}
                          onMouseLeave={handleMouseLeave}
                          onClick={() => handleClick(button.html_code || '', 'HTML Code')}
                        >
                          {button.html_code
                            ? `${button.html_code.substring(0, 16)}...${button.html_code.slice(-16)}`
                            : 'N/A'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            </Collapse>
          </TableCell>
        </TableRow>
      )}
    </React.Fragment>
  );
})}
</TableBody>
</Table>
</TableContainer>
<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, justifyContent: 'flex-end', padding: '4px 0' }}>
  <IconButton
    onClick={() => setPage(0)}
    disabled={page === 0}
    color="inherit"
    size="small"
    sx={{ mr: 0.5 }}
  >
    <FirstPage />
  </IconButton>
  <IconButton
    onClick={() => setPage(page - 1)}
    disabled={page === 0}
    color="inherit"
    size="small"
  >
    {/* Previous */}
  </IconButton>
  <TablePagination
    component="div"
    count={filteredButtons.length}
    page={page}
    onPageChange={(e, newPage) => {
      setPage(newPage);
      logWithTimestamp(F, 'Page changed to:', newPage, 'Rows:', paginatedButtons.length);
      setHoveredValue(null);
      setClickedValue(null);
      setIsClicked(false);
      setExitDirection(null);
      setLastClickedColumn(null);
    }}
    rowsPerPage={rowsPerPage}
    onRowsPerPageChange={handleRowsPerPageChange}
    rowsPerPageOptions={rowsPerPageOptions}
    sx={{ mx: 0, flexShrink: 1 }}
  />
  <IconButton
    onClick={() => setPage(page + 1)}
    disabled={page >= Math.ceil(filteredButtons.length / rowsPerPage) - 1}
    color="inherit"
    size="small"
  >
    {/* Next */}
  </IconButton>
  <IconButton
    onClick={() => setPage(Math.ceil(filteredButtons.length / rowsPerPage) - 1)}
    disabled={page >= Math.ceil(filteredButtons.length / rowsPerPage) - 1}
    color="inherit"
    size="small"
    sx={{ ml: 0.5 }}
  >
    <LastPage />
  </IconButton>
</Box>
{(hoveredValue || clickedValue) && tableRef.current && (
  <Box
    sx={{
      position: 'fixed',
      left: `${tableRef.current.getBoundingClientRect().left}px`,
      top: `${tableRef.current.getBoundingClientRect().bottom + 10}px`,
      backgroundColor: theme.palette.background.paper,
      padding: '4px 8px',
      borderRadius: '4px',
      zIndex: 1000,
      whiteSpace: 'nowrap',
      display: 'flex',
      alignItems: 'center',
      maxWidth: '100%',
    }}
  >
    <Tooltip
      title={
        hoveredValue && exitDirection === 'bottom'
          ? 'click to reset'
          : clickedValue
          ? 'click to reset'
          : hoveredValue
          ? 'click table field'
          : ''
      }
    >
      <Typography
        onClick={(hoveredValue && exitDirection === 'bottom') || clickedValue ? handleReset : undefined}
        sx={{
          marginRight: '8px',
          fontFamily: 'monospace',
          cursor: (hoveredValue && exitDirection === 'bottom') || clickedValue ? 'pointer' : 'default',
        }}
      >
        {clickedValue && ['Button Id', 'Payment Id', 'HTML Code'].includes(lastClickedColumn || '')
          ? clickedValue
          : hoveredValue || clickedValue}
      </Typography>
    </Tooltip>
    {hoveredValue && (
      <Tooltip title="click table field to enable copy">
        <span>
          <IconButton size="small" disabled>
            <ContentCopyIcon />
          </IconButton>
        </span>
      </Tooltip>
    )}
    {clickedValue && (
      <Tooltip title="copy field">
        <IconButton
          size="small"
          onClick={() => {
            navigator.clipboard.writeText(clickedValue)
              .catch((err) => logWithTimestamp(F, 'Failed to copy to clipboard:', err));
            setClickedValue(null);
            setIsClicked(false);
          }}
        >
          <ContentCopyIcon />
        </IconButton>
      </Tooltip>
    )}
  </Box>
)}
{showCustomInput && (
  <Box sx={{ mb: 2, textAlign: 'right' }}>
    <TextField
      type="number"
      label="Custom Rows"
      value={customRowsPerPage}
      onChange={handleCustomRowsPerPageChange}
      onKeyPress={handleCustomInputComplete}
      onBlur={handleCustomInputComplete}
      variant="outlined"
      size="small"
      inputProps={{ min: 1, max: 500, step: 1 }}
      sx={{ width: 100 }}
    />
  </Box>
)}
</>
)}
</Container>
);
};

export default PaymentButtonsList;