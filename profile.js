import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

const supabaseUrl = "https://evberyanshxxalxtwnnc.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2YmVyeWFuc2h4eGFseHR3bm5jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQwODMwOTcsImV4cCI6MjA1OTY1OTA5N30.pEoPiIi78Tvl5URw0Xy_vAxsd-3XqRlC8FTnX9HpgMw";
const supabase = createClient(supabaseUrl, supabaseKey);

// Global state
let currentUser = null;
let balanceHidden = true;

// Initialize page
document.addEventListener('DOMContentLoaded', async () => {
    // Get user from localStorage
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user) {
        window.location.href = 'index.html';
        return;
    }
    
    // Set current user
    currentUser = {
        phone: user.phone,
        username: user.username,
        balance: user.balance || 0
    };
    
    // Load profile data
    await loadProfile();
    
    // Set up event listeners
    setupEventListeners();
});

function setupEventListeners() {
    // Back button
    document.getElementById('back-btn').addEventListener('click', () => {
        window.history.back();
    });
    
    // Balance visibility toggle
    document.getElementById('balance-visibility').addEventListener('click', toggleBalanceVisibility);
    
    // Refresh transactions
    document.querySelector('.section-header .material-icons').addEventListener('click', refreshTransactions);
    
    // Modal buttons
    document.querySelector('.btn-deposit').addEventListener('click', showDepositModal);
    document.querySelector('.btn-withdraw').addEventListener('click', showWithdrawModal);
    
    // Close modals
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', function() {
            closeModal(this.closest('.modal').id);
        });
    });
    
    // Form submissions
    document.querySelector('#deposit-modal .btn-submit').addEventListener('click', processDeposit);
    document.querySelector('#withdraw-modal .btn-submit').addEventListener('click', processWithdrawal);
}

async function loadProfile() {
    try {
        // Show loading state
        document.getElementById('transactions-list').innerHTML = `
            <div class="loading-spinner">
                <span class="material-icons spin">autorenew</span> Loading transactions...
            </div>
        `;
        
        // Load balance
        const { data: balanceData, error: balanceError } = await supabase
            .from('users')
            .select('balance')
            .eq('phone', currentUser.phone)
            .single();
        
        if (!balanceError && balanceData) {
            currentUser.balance = balanceData.balance;
            updateBalanceDisplay();
        }
        
        // Load transactions
        const { data: transactions, error: transactionsError } = await supabase
            .from('player_transactions')
            .select('*')
            .eq('player_phone', currentUser.phone)
            .order('created_at', { ascending: false });
        
        if (!transactionsError) {
            renderTransactions(transactions || []);
        } else {
            throw transactionsError;
        }
        
    } catch (error) {
        console.error('Error loading profile:', error);
        showAlert('Failed to load profile data', 'error');
    }
}

function updateBalanceDisplay() {
    const balanceValue = document.getElementById('balance-value');
    const visibilityIcon = document.getElementById('balance-visibility');
    
    if (balanceHidden) {
        balanceValue.textContent = '••••.••';
        visibilityIcon.textContent = 'visibility';
    } else {
        balanceValue.textContent = currentUser.balance.toFixed(2);
        visibilityIcon.textContent = 'visibility_off';
    }
}

function toggleBalanceVisibility() {
    balanceHidden = !balanceHidden;
    updateBalanceDisplay();
}

function renderTransactions(transactions) {
    const transactionsList = document.getElementById('transactions-list');
    
    if (transactions.length === 0) {
        transactionsList.innerHTML = `
            <div class="no-transactions">
                <span class="material-icons">receipt</span>
                <p>No transactions yet</p>
            </div>
        `;
        return;
    }
    
    let html = '';
    transactions.forEach(transaction => {
        // Determine icon and color based on transaction type and status
        let icon = '';
        let amountClass = '';
        
        if (transaction.status === 'rejected') {
            icon = 'error';
            amountClass = 'negative';
        } else if (transaction.status === 'pending') {
            icon = 'schedule';
            amountClass = 'pending';
        } else {
            switch(transaction.transaction_type) {
                case 'deposit':
                    icon = 'account_balance_wallet';
                    amountClass = 'positive';
                    break;
                case 'withdrawal':
                    icon = 'payments';
                    amountClass = 'negative';
                    break;
                case 'bet':
                    icon = 'sports_esports';
                    amountClass = 'negative';
                    break;
                case 'win':
                    icon = 'emoji_events';
                    amountClass = 'positive';
                    break;
                case 'loss':
                    icon = 'mood_bad';
                    amountClass = 'negative';
                    break;
                default:
                    icon = 'receipt';
                    amountClass = 'neutral';
            }
        }
        
        // Format date
        const transactionDate = new Date(transaction.created_at);
        const formattedDate = transactionDate.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        // Format amount
        const sign = transaction.amount >= 0 ? '+' : '';
        const formattedAmount = sign + transaction.amount.toFixed(2);
        
        // Status text if not completed
        const statusText = transaction.status !== 'completed' ? ` (${transaction.status})` : '';
        
        html += `
            <div class="transaction-item" onclick="showTransactionDetails('${transaction.id}')">
                <div class="transaction-icon">
                    <span class="material-icons">${icon}</span>
                </div>
                <div class="transaction-info">
                    <span class="transaction-type">
                        ${transaction.transaction_type.charAt(0).toUpperCase() + transaction.transaction_type.slice(1)}
                        ${statusText}
                    </span>
                    <span class="transaction-description">${transaction.description || 'No description'}</span>
                    <span class="transaction-date">${formattedDate}</span>
                </div>
                <div class="transaction-amount ${amountClass}">
                    ${formattedAmount} ETB
                </div>
            </div>
        `;
    });
    
    transactionsList.innerHTML = html;
}

async function refreshTransactions() {
    const transactionsList = document.getElementById('transactions-list');
    transactionsList.innerHTML = `
        <div class="loading-spinner">
            <span class="material-icons spin">autorenew</span> Refreshing transactions...
        </div>
    `;
    
    try {
        const { data: transactions, error } = await supabase
            .from('player_transactions')
            .select('*')
            .eq('player_phone', currentUser.phone)
            .order('created_at', { ascending: false });
        
        if (!error) {
            renderTransactions(transactions || []);
            showAlert('Transactions refreshed', 'success');
        } else {
            throw error;
        }
    } catch (error) {
        console.error('Error refreshing transactions:', error);
        showAlert('Failed to refresh transactions', 'error');
    }
}

// Modal functions
function showDepositModal() {
    document.getElementById('deposit-modal').style.display = 'flex';
    document.getElementById('deposit-amount').focus();
}

function showWithdrawModal() {
    document.getElementById('withdraw-amount').max = currentUser.balance;
    document.getElementById('withdraw-modal').style.display = 'flex';
    document.getElementById('withdraw-amount').focus();
}

function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
    // Reset form
    document.querySelector(`#${modalId} form`).reset();
}

// Process deposit
async function processDeposit() {
    const amount = parseFloat(document.getElementById('deposit-amount').value);
    const method = document.getElementById('deposit-method').value;
    const transactionId = document.getElementById('transaction-id').value.trim();
    
    if (!amount || amount < 10) {
        showAlert('Minimum deposit is 10 ETB', 'error');
        return;
    }
    
    if (!transactionId) {
        showAlert('Please enter transaction ID', 'error');
        return;
    }
    
    try {
        // Create a pending transaction
        const { data, error } = await supabase
            .from('player_transactions')
            .insert([{
                player_phone: currentUser.phone,
                transaction_type: 'deposit',
                amount: amount,
                balance_before: currentUser.balance,
                balance_after: currentUser.balance + amount,
                description: `${method} deposit (TxID: ${transactionId})`,
                status: 'pending',
                game_id: null,
                created_at: new Date().toISOString()
            }])
            .select();
        
        if (error) throw error;
        
        showAlert('Deposit submitted for review', 'success');
        closeModal('deposit-modal');
        await loadProfile();
        
    } catch (error) {
        console.error('Deposit error:', error);
        showAlert('Failed to submit deposit', 'error');
    }
}

// Process withdrawal
async function processWithdrawal() {
    const amount = parseFloat(document.getElementById('withdraw-amount').value);
    const method = document.getElementById('withdraw-method').value;
    const accountNumber = document.getElementById('account-number').value.trim();
    
    if (!amount || amount < 50) {
        showAlert('Minimum withdrawal is 50 ETB', 'error');
        return;
    }
    
    if (amount > currentUser.balance) {
        showAlert('Insufficient balance', 'error');
        return;
    }
    
    if (!accountNumber) {
        showAlert('Please enter account details', 'error');
        return;
    }
    
    try {
        // First update the user's balance
        const newBalance = currentUser.balance - amount;
        const { error: updateError } = await supabase
            .from('users')
            .update({ balance: newBalance })
            .eq('phone', currentUser.phone);
        
        if (updateError) throw updateError;
        
        // Then create the withdrawal transaction
        const { error: transactionError } = await supabase
            .from('player_transactions')
            .insert([{
                player_phone: currentUser.phone,
                transaction_type: 'withdrawal',
                amount: -amount,
                balance_before: currentUser.balance,
                balance_after: newBalance,
                description: `Withdrawal to ${method} (${accountNumber})`,
                status: 'pending',
                game_id: null,
                created_at: new Date().toISOString()
            }]);
        
        if (transactionError) throw transactionError;
        
        // Update local balance
        currentUser.balance = newBalance;
        updateBalanceDisplay();
        
        showAlert('Withdrawal request submitted', 'success');
        closeModal('withdraw-modal');
        await loadProfile();
        
    } catch (error) {
        console.error('Withdrawal error:', error);
        showAlert('Failed to process withdrawal', 'error');
    }
}

// Show transaction details (placeholder)
function showTransactionDetails(transactionId) {
    alert(`Transaction details for ID: ${transactionId}\nThis would show more details in a real implementation.`);
}

// Show alert message
function showAlert(message, type) {
    const alert = document.createElement('div');
    alert.className = `alert alert-${type}`;
    alert.innerHTML = `
        <span class="material-icons">${type === 'success' ? 'check_circle' : 'error'}</span>
        ${message}
    `;
    
    document.body.appendChild(alert);
    
    setTimeout(() => {
        alert.classList.add('fade-out');
        setTimeout(() => alert.remove(), 500);
    }, 3000);
}

// Add spin animation to CSS
const style = document.createElement('style');
style.innerHTML = `
    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }
    .spin {
        animation: spin 1s linear infinite;
    }
`;
document.head.appendChild(style);
