import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';

function SignupForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('');

  async function submit(e) {
    e.preventDefault();
    console.log('signup attempt', { email, password });
    const res = await fetch('/api/signup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    setStatus(res.ok ? 'Welcome!' : 'Error: ' + (await res.text()));
  }

  return (
    <form onSubmit={submit}>
      <input placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input placeholder="password" type="text" value={password} onChange={(e) => setPassword(e.target.value)} />
      <button>Sign up</button>
      <div dangerouslySetInnerHTML={{ __html: status }} />
    </form>
  );
}

createRoot(document.getElementById('root')).render(<SignupForm />);
