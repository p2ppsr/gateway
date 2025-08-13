/**
 * @file src/pages/Buttons/index.tsx
 *
 * Displays a paginated table of payment buttons created by the user.
 * Each row represents a button, showing ID, amount, currency, and other details.
 *
 * - Fetches buttons from the backend using `authFetch` and the Metanet client with full data fetch
 * - Includes filters for usage (all, used, unused) and client-side sorting by all columns via clickable headers
 * - Implements an empty state with a CTA to create a button
 * - Uses MUI table components with pagination, allowing custom rows per page via a dropdown with a "set 5..100" trigger and a popup number input
 * - Utilizes `formatBSV` from `utils/general.ts` for consistent amount formatting
 * - Uses `logWithTimestamp` from `utils/logging.ts` with configuration from `logging.config.ts` to measure performance and color-code logs
 * - Optimizes performance with single initial fetch
 * - Adjusted `useRef` type to `number | null` to align with browser `setTimeout` return type, correcting TS2322 error
 * - Added `description` column to the table for custom spending descriptions
 * - Added `customCSS` column to display truncated HTML code (first 16 chars, ellipsis, last 16 chars), renamed to HTML Code
 * - Added check for buttons with customCSS in database and logs discrepancy, with tracing for empty HTML code (03Aug2025_1425 BST)
 * - Updated to reflect successful customCSS storage in database (03Aug2025_1459 BST)
 * - Added default sorting by timestamp (most recent first) (04Aug2025_1101 BST)
 * - Aligned with Payments page pattern and fixed type errors (13Aug2025_2045 BST)
 *
 * Used by the Gateway UI to manage user-created payment buttons. For local testing, delays are attributed to server or application logic,
 * not external connections or hardware constraints (MacBook Pro M4 Max, 128GB RAM, 2TB SSD), guiding optimization efforts
 * Version: v3.72 (Updated 13Aug2025_2045 BST to align with Payments page)
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
  Tooltip
} from '@mui/material';
import { FirstPage, LastPage, ReceiptLong } from '@mui/icons-material';
import { WalletClient, AuthFetch } from '@bsv/sdk';
import { useTheme } from '@mui/material/styles';
import { Link } from 'react-router-dom';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { formatId, formatTimestamp } from '../../utils/general';
import { logWithTimestamp } from '../../utils/logging';
import { CONFIG, MAX_PAYMENT_SATS } from '../../utils/constants';
const WALLET_ORIGIN = CONFIG.WALLET_ORIGIN;
const wallet = new WalletClient('auto', WALLET_ORIGIN);
const authFetch = new AuthFetch(wallet);

/**
 * Represents a payment button created by the user
 */
interface Button {
  id: string | null; // Unique identifier for the button
  button_id: string | null; // Pre-created ID for the button
  amount: number | null; // Configured payment amount
  currency: string | null; // Currency type (e.g., BSV)
  variable_amount: boolean | null; // Whether the amount is variable
  multi_use: boolean | null; // Whether the button can be used multiple times
  used: boolean | null; // Whether the button has been used
  accepts: string | null; // Accepted payment types (e.g., BSV)
  total_paid: number | null; // Total amount paid through the button
  description: string | null; // Custom description for the button
  customCSS: string | null; // Custom CSS/HTML code for the button
  timestamp: string | null; // Creation timestamp
  created_at: string | null; // Alternative creation timestamp
  payment_id: string | null; // Associated payment ID
}

interface ButtonResponse {
  status: string;
  message: string;
  title?: string; // Optional title from API
  data: {
    id?: string;
    buttonId?: string | null;
    amount?: string | number | null;
    currency?: string | null;
    variable?: number | null;
    multiUse?: number | null;
    used?: number | null;
    accepts?: string | null;
    totalPaid?: string | number | null;
    description?: string | null;
    htmlCode?: string | null;
    timestamp?: string | null;
    created_at?: string | null;
    paymentId?: string | null;
  }[];
  total?: number;
}

interface SortConfig {
  key: keyof Button | null;
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
  const [customOptions, setCustomOptions] = useState<number[]>([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [title, setTitle] = useState<string>('Payment Buttons'); // Default title
  const theme = useTheme();
  const fetchTimeout = useRef<number | null>(null);
  const [hoveredValue, setHoveredValue] = useState<string | null>(null);
  const [clickedValue, setClickedValue] = useState<string | null>(null);
  const [isClicked, setIsClicked] = useState(false); // New state to disable hover after click
  const [exitDirection, setExitDirection] = useState<string | null>(null); // Track exit direction
  const [lastClickedColumn, setLastClickedColumn] = useState<string | null>(null); // Track last clicked column
  const tableRef = useRef<HTMLDivElement>(null);
  const columnRefs = useRef<{ [key: string]: HTMLTableCellElement | null }>({
    'Button Id': null,
    'Payment Id': null,
    'HTML Code': null
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
      const hoveredColumn = Object.keys(columnRefs.current).find(col =>
        columnRefs.current[col]?.contains(e.target as Node)
      );
      if (hoveredColumn) {
        const colRect = columnRefs.current[hoveredColumn]!.getBoundingClientRect();
        const isBottomExit = mouseY > colRect.bottom && mouseX >= colRect.left && mouseX <= colRect.right;
        if (isBottomExit && (hoveredColumn === 'Button Id' || hoveredColumn === 'Payment Id' || hoveredColumn === 'HTML Code')) {
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
    setHoveredValue(null); // Clear hover state
    setIsClicked(true); // Disable further hover events
    setClickedValue(fullValue);
    setLastClickedColumn(columnName); // Track the clicked column
    navigator.clipboard.writeText(fullValue).catch(err => logWithTimestamp(F, 'Failed to copy to clipboard:', err));
  };

  const handleReset = () => {
    logWithTimestamp(F, 'Reset click');
    setClickedValue(null);
    setIsClicked(false); // Re-enable hover events
    setHoveredValue(null); // Clear hover on reset
    setExitDirection(null);
    setLastClickedColumn(null); // Clear last clicked column
  };

  const fetchButtons = async () => {
    setLoading(true);
    setButtons([]); // Clear state to force refresh
    try {
      const url = `${location.protocol}//${location.host}/api/listButtons?limit=${MAX_PAYMENT_SATS}`;
      logWithTimestamp(F, 'Fetching total buttons with URL:', url);
      const response = await authFetch.fetch(url, { method: 'GET' });
      const data: ButtonResponse = await response.json();
      logWithTimestamp(F, 'API response:', JSON.stringify(data)); // Debug API response
      if (data.status === 'error') throw new Error(`❌ ${data.message ?? 'Failed to fetch total buttons'}`);
      // Map API response to Button interface
      const mappedButtons = data.data.map(button => ({
        id: button.id || null,
        button_id: button.buttonId || null,
        amount: typeof button.amount === 'string' ? parseFloat(button.amount) : button.amount || null,
        currency: button.currency || null,
        variable_amount: button.variable === 1 || false,
        multi_use: button.multiUse === 1 || false,
        used: button.used === 1 || false,
        accepts: button.accepts || null,
        total_paid: typeof button.totalPaid === 'string' ? parseFloat(button.totalPaid) : button.totalPaid || null,
        description: button.description || null,
        customCSS: button.htmlCode || null,
        timestamp: button.timestamp || null,
        created_at: button.created_at || null,
        payment_id: button.paymentId || null,
      }));
      logWithTimestamp(F, 'Mapped buttons:', JSON.stringify(mappedButtons));
      setTotalRecords(data.total || mappedButtons.length);
      setButtons(mappedButtons);
      setTitle(data.title || 'Payment Buttons');
      logWithTimestamp(F, 'Initial buttons length:', mappedButtons.length);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '❌ Unknown error';
      logWithTimestamp(F, '❌ Error fetching total buttons:', message);
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchButtons(); // Initial fetch on mount
    return () => {
      if (fetchTimeout.current) clearTimeout(fetchTimeout.current);
    };
  }, []); // Empty dependency array ensures this runs only on mount

  useEffect(() => {
    setPage(0);
  }, [usedFilter]);

  const requestSort = (key: keyof Button) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const handleRowsPerPageChange = (event: React.ChangeEvent<{ value: unknown }>) => {
    const value = event.target.value;
    logWithTimestamp(
      F,
      'Rows per page change:',
      value,
      'Current options:',
      rowsPerPageOptions.map(opt => opt.value)
    );
    if (typeof value === 'object' && value !== null && 'value' in value && value.value === 0) {
      setShowCustomInput(true);
    } else {
      const numValue = typeof value === 'number' ? value : (value as any)?.value || 5;
      const isValidOption = rowsPerPageOptions.some(option => option.value === numValue);
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
    if (isNaN(numValue) || numValue <= 0 || numValue > 100) {
      setRowsPerPage(5);
    } else {
      setRowsPerPage(numValue);
      setCustomOptions(prev => {
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
    { value: 25, label: '25' }
  ];
  const rowsPerPageOptions = [
    { value: 0, label: 'set 1..500' },
    ...baseOptions,
    ...customOptions.map(value => ({ value, label: value.toString() }))
  ];

  const filteredButtons =
    usedFilter === 'all'
      ? buttons
      : buttons.filter(
          button => (usedFilter === 'used' && button.used === true) || (usedFilter === 'unused' && button.used === false)
        );
  const sortedButtons = sortConfig.key
    ? [...filteredButtons].sort((a, b) => {
        if (!sortConfig.key) return 0; // Default to no change if key is null
        let aValue: string | number | Date | boolean | null | undefined = a[sortConfig.key];
        let bValue: string | number | Date | boolean | null | undefined = b[sortConfig.key];
        // Handle null/undefined values by placing them at the end
        if (aValue === null || aValue === undefined) return 1;
        if (bValue === null || bValue === undefined) return -1;
        // Convert to comparable types
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
        } else if (sortConfig.key === 'timestamp' || sortConfig.key === 'created_at') {
          aValue = new Date(aValue as string || '');
          bValue = new Date(bValue as string || '');
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
      const buttonIdCell = document.querySelector(`tr:nth-child(${index + 1}) td:nth-child(2)`) as HTMLTableCellElement | null;
      const paymentIdCell = document.querySelector(`tr:nth-child(${index + 1}) td:nth-child(3)`) as HTMLTableCellElement | null;
      const htmlCodeCell = document.querySelector(`tr:nth-child(${index + 1}) td:nth-child(10)`) as HTMLTableCellElement | null;
      if (buttonIdCell) {
        columnRefs.current['Button Id'] = buttonIdCell;
        logWithTimestamp(F, `Button Id ref assigned for index: ${index}`);
      } else {
        logWithTimestamp(F, 'Button Id ref is null for index:', index);
      }
      if (paymentIdCell) {
        columnRefs.current['Payment Id'] = paymentIdCell;
        logWithTimestamp(F, `Payment Id ref assigned for index: ${index}`);
      } else {
        logWithTimestamp(F, 'Payment Id ref is null for index:', index);
      }
      if (htmlCodeCell) {
        columnRefs.current['HTML Code'] = htmlCodeCell;
        logWithTimestamp(F, `HTML Code ref assigned for index: ${index}`);
      } else {
        logWithTimestamp(F, 'HTML Code ref is null for index:', index);
      }
    });
  }, [paginatedButtons]);

  if (loading) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
          backgroundColor: theme.palette.background.default
        }}
      >
        <CircularProgress />
      </Box>
    );
  }
  if (error !== '') {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '90vh',
          backgroundColor: theme.palette.background.paper
        }}
      >
        <Typography color="error">❌ Error: {error}</Typography>
      </Box>
    );
  }
  return (
    <Container>
      <Box
        sx={{
          textAlign: 'center',
          marginBottom: theme.spacing(4),
          marginTop: theme.spacing(5),
          color: theme.palette.mode === 'dark' ? '#ffffff' : '#000000'
        }}
      >
        <Typography variant="h2">{title}</Typography>
        <Typography variant="subtitle1">View all the payment buttons you have created</Typography>
      </Box>
      {filteredButtons.length === 0 ? (
        <Card
          sx={{
            maxWidth: 600,
            margin: 'auto',
            padding: theme.spacing(4),
            textAlign: 'center',
            backgroundColor: theme.palette.background.paper
          }}
        >
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
              onChange={e => setUsedFilter(e.target.value as 'all' | 'used' | 'unused')}
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
                      onClick={e => {
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
                      onClick={e => {
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
                      onClick={e => {
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
                      onClick={e => {
                        e.preventDefault();
                        requestSort('amount');
                      }}
                      sx={{ cursor: 'pointer', textDecoration: 'underline', color: 'inherit', whiteSpace: 'nowrap' }}
                    >
                      Amount(Sats) {sortConfig.key === 'amount' && (sortConfig.direction === 'asc' ? ' ↑' : ' ↓')}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography
                      component="a"
                      href="#"
                      onClick={e => {
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
                      onClick={e => {
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
                      onClick={e => {
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
                      onClick={e => {
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
                      onClick={e => {
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
                      onClick={e => {
                        e.preventDefault();
                        requestSort('customCSS');
                      }}
                      sx={{ cursor: 'pointer', textDecoration: 'underline', color: 'inherit', whiteSpace: 'nowrap' }}
                    >
                      HTML Code {sortConfig.key === 'customCSS' && (sortConfig.direction === 'asc' ? ' ↑' : ' ↓')}
                    </Typography>
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {paginatedButtons.map((button, index) => {
                  const fullButtonId = button.button_id || '';
                  const fullPaymentId = button.payment_id || '';
                  const fullHtmlCode = button.customCSS || 'N/A';
                  return (
                    <TableRow key={button.id || index}>
                      <TableCell>{formatTimestamp(button.created_at || button.timestamp || new Date().toISOString())}</TableCell>
                      <TableCell
                        ref={(el: HTMLTableCellElement | null) => (columnRefs.current['Button Id'] = el)}
                        onMouseEnter={() => handleMouseEnter(fullButtonId, 'Button Id', index + 1)}
                        onMouseLeave={handleMouseLeave}
                        onClick={() => handleClick(fullButtonId, 'Button Id')}
                      >
                        {formatId(button.button_id || '')}
                      </TableCell>
                      <TableCell
                        ref={(el: HTMLTableCellElement | null) => (columnRefs.current['Payment Id'] = el)}
                        onMouseEnter={() => handleMouseEnter(fullPaymentId, 'Payment Id', index + 1)}
                        onMouseLeave={handleMouseLeave}
                        onClick={() => handleClick(fullPaymentId, 'Payment Id')}
                      >
                        {formatId(button.payment_id || '')}
                      </TableCell>
                      <TableCell>{button.amount !== null ? button.amount : 'N/A'}</TableCell>
                      <TableCell>{button.variable_amount !== null ? (button.variable_amount ? 'Yes' : 'No') : 'N/A'}</TableCell>
                      <TableCell>{button.multi_use !== null ? (button.multi_use ? 'Yes' : 'No') : 'N/A'}</TableCell>
                      <TableCell>{button.used !== null ? (button.used ? 'Yes' : 'No') : 'N/A'}</TableCell>
                      <TableCell>{button.total_paid !== null ? button.total_paid : 'N/A'}</TableCell>
                      <TableCell>{button.description || 'N/A'}</TableCell>
                      <TableCell
                        ref={(el: HTMLTableCellElement | null) => (columnRefs.current['HTML Code'] = el)}
                        onMouseEnter={() => handleMouseEnter(fullHtmlCode, 'HTML Code', index + 1)}
                        onMouseLeave={handleMouseLeave}
                        onClick={() => handleClick(fullHtmlCode, 'HTML Code')}
                      >
                        {button.customCSS
                          ? `${button.customCSS.substring(0, 16)}...${button.customCSS.slice(-16)}`
                          : 'N/A'}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.25,
              justifyContent: 'flex-end',
              width: '100%',
              boxSizing: 'border-box',
              padding: '4px 0'
            }}
          >
            <IconButton onClick={() => setPage(0)} disabled={page === 0} color="inherit" size="small" sx={{ mr: 0.5 }}>
              <FirstPage />
            </IconButton>
            <IconButton onClick={() => setPage(page - 1)} disabled={page === 0} color="inherit" size="small">
              {/* "Previous" handled by TablePagination context */}
            </IconButton>
            <TablePagination
              component="div"
              count={filteredButtons.length}
              page={page}
              onPageChange={(e, newPage) => {
                setPage(newPage);
                logWithTimestamp(
                  F,
                  'Page changed to:',
                  newPage,
                  'Rows:',
                  paginatedButtons,
                  'filteredButtons.length:',
                  filteredButtons.length
                );
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
              {/* "Next" handled by TablePagination context */}
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
                maxWidth: '100%'
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
                    cursor: (hoveredValue && exitDirection === 'bottom') || clickedValue ? 'pointer' : 'default'
                  }}
                >
                  {clickedValue && ['Button Id', 'Payment Id', 'HTML Code'].includes(lastClickedColumn || '') ? (
                    clickedValue
                  ) : (
                    hoveredValue || clickedValue
                  )}
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
                      navigator.clipboard
                        .writeText(clickedValue)
                        .catch(err => logWithTimestamp(F, 'Failed to copy to clipboard:', err));
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
                inputProps={{ min: 1, max: 100, step: 1 }}
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