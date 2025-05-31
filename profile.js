import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

const supabaseUrl = "https://evberyanshxxalxtwnnc.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2YmVyeWFuc2h4eGFseHR3bm5jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQwODMwOTcsImV4cCI6MjA1OTY1OTA5N30.pEoPiIi78Tvl5URw0Xy_vAxsd-3XqRlC8FTnX9HpgMw";
const supabase = createClient(supabaseUrl, supabaseKey);

// Get user from localStorage
const user = JSON.parse(localStorage.getItem('user'));
if (!user) {
    window.location.href = 'index.html';
} else {
    // Define currentUser globally
    window.currentUser = {
        phone: user.phone,
        username: user.username,
        balance: user.balance
    };
    
    // Load profile data
    loadProfile();
}

async function loadProfile() {
    try {
        // Show loading state
        document.getElementById('transactions-list').innerHTML = `
            <div class="loading-spinner">
                <span class="material-icons">autorenew</span>
                <p>Loading transactions...</p>
            </div>
        `;

        // Load balance
        const { data: balanceData } = await supabase
            .from('users')
            .select('balance')
            .eq('phone', currentUser.phone)
            .single();
        
        if (balanceData) {
            currentUser.balance = balanceData.balance;
            document.getElementById('current-balance').textContent = `${balanceData.balance.toFixed(2)} ETB`;
        }

        // Load transactions
        const { data: transactions } = await supabase
            .from('player_transactions')
            .select('*')
            .eq('player_phone', currentUser.phone)
            .order('created_at', { ascending: false });
        
        renderTransactions(transactions || []);

    } catch (error) {
        console.error('Error loading profile:', error);
        showAlert('error', 'Failed to load profile data');
        document.getElementById('transactions-list').innerHTML = `
            <div class="no-transactions">
                <span class="material-icons">error</span>
                <p>Failed to load transactions</p>
            </div>
        `;
    }
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
    
    transactionsList.innerHTML = '';
    
    transactions.forEach(transaction => {
        const transactionEl = document.createElement('div');
        transactionEl.className = 'transaction-item';
        
        // Determine icon and styling based on transaction type and status
        let iconClass = '';
        let amountClass = '';
        let icon = '';
        let statusText = '';
        
        // Handle transaction status first
        if (transaction.status === 'rejected') {
            iconClass = 'icon-rejected';
            amountClass = 'negative';
            icon = 'close';
            statusText = ` (Rejected)`;
        } 
        else if (transaction.status === 'pending') {
            iconClass = 'icon-pending';
            amountClass = 'pending';
            icon = 'schedule';
            statusText = ` (Pending)`;
        }
        // Handle transaction types if no special status
        else {
            switch(transaction.transaction_type) {
                case 'deposit':
                    iconClass = 'icon-deposit';
                    amountClass = 'positive';
                    icon = 'account_balance_wallet';
                    break;
                case 'withdrawal':
                    iconClass = 'icon-withdrawal';
                    amountClass = 'negative';
                    icon = 'account_balance';
                    break;
                case 'bet':
                    iconClass = 'icon-bet';
                    amountClass = 'negative';
                    icon = 'sports_esports';
                    break;
                case 'win':
                    iconClass = 'icon-win';
                    amountClass = 'positive';
                    icon = 'emoji_events';
                    break;
                case 'loss':
                    iconClass = 'icon-loss';
                    amountClass = 'negative';
                    icon = 'thumb_down';
                    break;
                default:
                    iconClass = 'icon-default';
                    amountClass = 'neutral';
                    icon = 'receipt';
            }
        }

        // Format date
        const transactionDate = new Date(transaction.created_at);
        const formattedDate = transactionDate.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        // Format amount (don't show + for rejected transactions)
        const formattedAmount = (transaction.status === 'rejected' ? '' : (transaction.amount >= 0 ? '+' : '')) + transaction.amount.toFixed(2);

        transactionEl.innerHTML = `
            <div class="transaction-icon ${iconClass}">
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
        `;

        transactionsList.appendChild(transactionEl);
    });
}

// Modal functions
function showDepositModal() {
    // Reset form
    document.getElementById('deposit-amount').value = '';
    document.getElementById('transaction-id').value = '';
    document.getElementById('deposit-modal').style.display = 'flex';
}

function showWithdrawModal() {
    // Set max amount to current balance
    document.getElementById('withdraw-amount').value = '';
    document.getElementById('withdraw-amount').max = currentUser.balance;
    document.getElementById('withdraw-modal').style.display = 'flex';
}

function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

// Process deposit with Telebirr
async function processDeposit() {
    const amount = parseFloat(document.getElementById('deposit-amount').value);
    const method = document.getElementById('deposit-method').value;
    const transactionId = document.getElementById('transaction-id').value.trim();

    if (!amount || amount <= 0 || !transactionId) {
        showAlert('error', 'Please enter a valid amount and transaction ID');
        return;
    }

    if (amount < 10) {
        showAlert('error', 'Minimum deposit amount is 10 ETB');
        return;
    }

    try {
        // Show loading state
        const submitBtn = document.querySelector('#deposit-modal .btn-submit');
        submitBtn.innerHTML = '<span class="material-icons spinning">autorenew</span> Processing...';
        submitBtn.disabled = true;

        // Create a pending transaction
        const { error } = await supabase
            .from('player_transactions')
            .insert({
                player_phone: currentUser.phone,
                transaction_type: 'deposit',
                amount: amount,
                balance_before: currentUser.balance,
                balance_after: currentUser.balance, // will update after approval
                description: `Pending ${method} deposit (TxID: ${transactionId})`,
                status: 'pending',
                game_id: null,
                created_at: new Date().toISOString()
            });

        if (error) throw error;

        showAlert('success', 'Deposit submitted for review. It will be approved shortly.');
        closeModal('deposit-modal');
        loadProfile();
    } catch (error) {
        console.error('Deposit error:', error);
        showAlert('error', 'Failed to submit deposit. Try again.');
    } finally {
        const submitBtn = document.querySelector('#deposit-modal .btn-submit');
        submitBtn.innerHTML = '<span class="material-icons">check_circle</span> Confirm Deposit';
        submitBtn.disabled = false;
    }
}

// Process withdrawal
async function processWithdrawal() {
    const amount = parseFloat(document.getElementById('withdraw-amount').value);
    const method = document.getElementById('withdraw-method').value;
    const bankAccount = document.getElementById('account-number').value.trim(); // Get bank account number

    if (!amount || amount <= 0) {
        showAlert('error', 'Please enter a valid amount');
        return;
    }
    
    if (amount > currentUser.balance) {
        showAlert('error', 'Insufficient balance');
        return;
    }
    
    // Minimum withdrawal amount
    if (amount < 50) {
        showAlert('error', 'Minimum withdrawal amount is 50 ETB');
        return;
    }
    
    try {
        // Show loading state
        const submitBtn = document.querySelector('#withdraw-modal .btn-submit');
        submitBtn.innerHTML = '<span class="material-icons spinning">autorenew</span> Processing...';
        submitBtn.disabled = true;

        // Check current balance
        const { data: userData, error: userError } = await supabase
            .from('users')
            .select('balance')
            .eq('phone', currentUser.phone)
            .single();
            
        if (userError) throw userError;
        
        if (amount > userData.balance) {
            showAlert('error', 'Insufficient balance');
            return;
        }
        
        const newBalance = userData.balance - amount;
        
        // Update user balance
        const { error: updateError } = await supabase
            .from('users')
            .update({ balance: newBalance })
            .eq('phone', currentUser.phone);
            
        if (updateError) throw updateError;
        
        // Create transaction record
        const { error: transactionError } = await supabase
            .from('player_transactions')
            .insert({
                player_phone: currentUser.phone,
                transaction_type: 'withdrawal',
                amount: -amount,
                balance_before: userData.balance,
                balance_after: newBalance,
                description: `Withdrawal via ${method} (Account: ${bankAccount})`, // Include bank account in description
                status: 'pending',
                game_id: null,
                created_at: new Date().toISOString()
            });
            
        if (transactionError) throw transactionError;
        
        showAlert('success', `Withdrawal of ${amount.toFixed(2)} ETB requested! It will be processed within 24 hours.`);
        closeModal('withdraw-modal');
        loadProfile();
    } catch (error) {
        console.error('Withdrawal error:', error);
        showAlert('error', 'Withdrawal failed. Please try again.');
    } finally {
        const submitBtn = document.querySelector('#withdraw-modal .btn-submit');
        submitBtn.innerHTML = '<span class="material-icons">send</span> Request Withdrawal';
        submitBtn.disabled = false;
    }
}

// Show alert message
function showAlert(type, message) {
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

// Back button functionality
document.getElementById('back-btn').addEventListener('click', () => {
    window.location.href = 'home.html';
});

// Initialize event listeners
document.addEventListener('DOMContentLoaded', () => {
    // Deposit button
    document.querySelector('.btn-deposit').addEventListener('click', showDepositModal);
    
    // Withdraw button
    document.querySelector('.btn-withdraw').addEventListener('click', showWithdrawModal);
    
    // Confirm deposit button
    document.querySelector('#deposit-modal .btn-submit').addEventListener('click', processDeposit);
    
    // Request withdrawal button
    document.querySelector('#withdraw-modal .btn-submit').addEventListener('click', processWithdrawal);
    
    // Close modal buttons
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', function() {
            closeModal(this.closest('.modal').id);
        });
    });
});
