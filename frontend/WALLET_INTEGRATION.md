# Stellar Wallet Integration (Freighter)

Complete Freighter wallet integration for VibePay, allowing users to connect their Stellar wallets, view balances, and sign transactions.

## Features

- ✅ Freighter wallet detection
- ✅ Connect/disconnect wallet functionality
- ✅ Display connected wallet address (truncated)
- ✅ Display XLM balance
- ✅ Network switching (testnet/mainnet)
- ✅ Sign and submit transactions
- ✅ Comprehensive error handling
- ✅ WalletContext for global state management

## Usage

### Basic Setup

Wrap your app with `WalletProvider`:

```tsx
import { WalletProvider } from './contexts/WalletContext';

function App() {
  return (
    <WalletProvider defaultNetwork="testnet">
      {/* Your app components */}
    </WalletProvider>
  );
}
```

### Using the Wallet Hook

```tsx
import { useWallet } from '../hooks/useWallet';

function MyComponent() {
  const {
    isConnected,
    publicKey,
    network,
    balance,
    connect,
    disconnect,
    signTransaction,
  } = useWallet();

  const handleConnect = async () => {
    try {
      await connect();
    } catch (error) {
      console.error('Failed to connect:', error);
    }
  };

  return (
    <div>
      {isConnected ? (
        <div>
          <p>Address: {publicKey}</p>
          <p>Balance: {balance?.balance} {balance?.asset}</p>
          <button onClick={disconnect}>Disconnect</button>
        </div>
      ) : (
        <button onClick={handleConnect}>Connect Wallet</button>
      )}
    </div>
  );
}
```

### Using WalletConnect Component

```tsx
import WalletConnect from './components/wallet/WalletConnect';

function MyPage() {
  return (
    <div>
      <WalletConnect />
    </div>
  );
}
```

### Signing Transactions

```tsx
import { useWallet } from '../hooks/useWallet';
import { buildPaymentTransaction, submitTransaction } from '../utils/transactions';

function TipButton({ artistAddress, amount }) {
  const { publicKey, network, signTransaction } = useWallet();

  const handleTip = async () => {
    try {
      // Build transaction
      const transactionXdr = await buildPaymentTransaction({
        from: publicKey!,
        to: artistAddress,
        amount: amount.toString(),
      }, network);

      // Sign transaction
      const signedXdr = await signTransaction(transactionXdr);

      // Submit transaction
      const result = await submitTransaction(signedXdr, network);
      console.log('Transaction successful:', result.hash);
    } catch (error) {
      console.error('Transaction failed:', error);
    }
  };

  return <button onClick={handleTip}>Send Tip</button>;
}
```

## Error Handling

The wallet integration handles all error cases:

- **NOT_INSTALLED**: Freighter wallet is not installed
- **LOCKED**: Wallet is locked
- **USER_REJECTED**: User rejected the request
- **NETWORK_ERROR**: Network-related error
- **UNKNOWN_ERROR**: Unknown error occurred

```tsx
import { WalletError, WalletErrorCode } from '../types/wallet';

try {
  await connect();
} catch (error) {
  if (error instanceof WalletError) {
    switch (error.code) {
      case WalletErrorCode.NOT_INSTALLED:
        // Show install Freighter message
        break;
      case WalletErrorCode.LOCKED:
        // Show unlock wallet message
        break;
      case WalletErrorCode.USER_REJECTED:
        // User rejected, no action needed
        break;
      default:
        // Handle other errors
    }
  }
}
```

## API Reference

### WalletContext

#### State
- `isConnected: boolean` - Whether wallet is connected
- `isConnecting: boolean` - Whether connection is in progress
- `publicKey: string | null` - Connected wallet public key
- `network: Network` - Current network (testnet/mainnet)
- `balance: WalletBalance | null` - Current XLM balance
- `error: string | null` - Error message if any

#### Methods
- `connect(): Promise<void>` - Connect to Freighter wallet
- `disconnect(): Promise<void>` - Disconnect wallet
- `switchNetwork(network: Network): Promise<void>` - Switch network
- `refreshBalance(): Promise<void>` - Refresh balance
- `signTransaction(transactionXdr: string): Promise<string>` - Sign transaction

### Utility Functions

#### `buildPaymentTransaction(params, network)`
Builds a payment transaction XDR string.

**Parameters:**
- `params.from: string` - Sender address
- `params.to: string` - Recipient address
- `params.amount: string` - Amount to send
- `params.asset?: Asset` - Asset (defaults to XLM)
- `params.memo?: string` - Optional memo
- `network: Network` - Network to use

**Returns:** `Promise<string>` - Transaction XDR string

#### `submitTransaction(signedXdr, network)`
Submits a signed transaction to the network.

**Parameters:**
- `signedXdr: string` - Signed transaction XDR
- `network: Network` - Network to submit to

**Returns:** `Promise<TransactionResponse>` - Transaction result

## Testing

Run tests with:

```bash
npm test
```

Test files:
- `src/hooks/__tests__/useWallet.test.ts`
- `src/components/wallet/__tests__/WalletConnect.test.tsx`

## Requirements

- Freighter browser extension installed
- Stellar account with testnet/mainnet funds
- Network connectivity

## Browser Support

- Chrome/Chromium
- Firefox
- Edge
- Brave

## Troubleshooting

### Wallet not detected
- Ensure Freighter extension is installed and enabled
- Refresh the page after installing Freighter
- Check browser console for errors

### Connection fails
- Ensure Freighter is unlocked
- Check that the extension has permission to access the site
- Try disconnecting and reconnecting

### Balance not showing
- Ensure account has XLM balance
- Check network matches (testnet vs mainnet)
- Try refreshing balance manually

### Transaction signing fails
- Ensure wallet is unlocked
- Check account has sufficient balance
- Verify transaction parameters are correct
