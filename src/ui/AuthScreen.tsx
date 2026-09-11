// PLAN-18/19: начальное окно — вход, регистрация (по инвайт-коду) и восстановление пароля,
// если оно включено на сервере (на публичном сервере выключено — plan/19).
import { useState } from 'react';
import { apiLogin, apiRegister, apiResetConfirm, apiResetRequest, type Features } from './api';

type Mode = 'login' | 'register' | 'reset';

const TITLES: Record<Mode, string> = {
  login: 'Вход',
  register: 'Регистрация',
  reset: 'Восстановление пароля',
};
const LEAD: Record<Mode, string> = {
  login: 'Войдите, чтобы продолжить свою студию.',
  register: 'Создайте аккаунт — партии хранятся в базе, у каждого игрока свои.',
  reset: 'Пришлём код на почту (в dev-режиме письмо падает в data/mail-out и код виден здесь).',
};

export function AuthScreen({ features }: { features: Features }) {
  const [mode, setMode] = useState<Mode>('login');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [invite, setInvite] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const switchMode = (m: Mode): void => {
    if (m === 'reset' && !features.passwordReset) return; // на публичном сервере сброса нет
    setMode(m);
    setError('');
    setInfo('');
    setCodeSent(false);
    setCode('');
    setPassword('');
  };

  async function submit(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError('');
    setInfo('');
    try {
      if (mode === 'login') {
        const r = await apiLogin(login.trim(), password);
        if (!r.ok) setError(r.error ?? 'Не удалось войти');
        else location.reload();
      } else if (mode === 'register') {
        const r = await apiRegister(login.trim(), password, email.trim(), invite.trim());
        if (!r.ok) setError(r.error ?? 'Не удалось зарегистрироваться');
        else location.reload();
      } else if (!codeSent) {
        const r = await apiResetRequest(login.trim());
        if (!r.ok) setError(r.error ?? 'Не удалось отправить код');
        else {
          setCodeSent(true);
          setInfo(r.devCode ? `Код из письма: ${r.devCode}` : 'Код отправлен на почту.');
        }
      } else {
        const r = await apiResetConfirm(login.trim(), code.trim(), password);
        if (!r.ok) setError(r.error ?? 'Не удалось сменить пароль');
        else {
          setCodeSent(false);
          setMode('login');
          setCode('');
          setPassword('');
          setInfo('Пароль изменён — войдите с новым паролем.');
        }
      }
    } catch {
      setError('Сервер недоступен — запустите: pnpm server');
    } finally {
      setBusy(false);
    }
  }

  const action = mode === 'reset' ? (codeSent ? 'Сменить пароль' : 'Отправить код') : mode === 'login' ? 'Войти' : 'Создать аккаунт';

  return (
    <div className="w95-desktop" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="w95-window focused" style={{ position: 'relative', width: 460, zIndex: 10 }}>
        <div className="w95-title">🖥️ Game Dev Studio — {TITLES[mode]}</div>
        <div className="w95-body" style={{ padding: 16 }}>
          <form className="w95-form" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
            <div className="w95-note">{LEAD[mode]}</div>

            <div className="w95-form-row">
              <label>Логин</label>
              <input className="w95-input" value={login} autoFocus
                disabled={mode === 'reset' && codeSent} onChange={(e) => setLogin(e.target.value)} />
            </div>
            {mode === 'register' && (
              <div className="w95-form-row">
                <label>Почта</label>
                <input className="w95-input" value={email} placeholder="необязательно"
                  onChange={(e) => setEmail(e.target.value)} />
              </div>
            )}
            {mode === 'register' && features.inviteRequired && (
              <div className="w95-form-row">
                <label>Инвайт-код</label>
                <input className="w95-input" value={invite} placeholder="GDS-XXXX-XXXX"
                  onChange={(e) => setInvite(e.target.value)} />
              </div>
            )}
            {mode === 'reset' && codeSent && (
              <div className="w95-form-row">
                <label>Код из письма</label>
                <input className="w95-input" value={code} onChange={(e) => setCode(e.target.value)} />
              </div>
            )}
            {(mode !== 'reset' || codeSent) && (
              <div className="w95-form-row">
                <label>{mode === 'reset' ? 'Новый пароль' : 'Пароль'}</label>
                <input className="w95-input" type="password" value={password}
                  onChange={(e) => setPassword(e.target.value)} />
              </div>
            )}
            {mode === 'register' && (
              <div className="w95-form-row">
                <label />
                <span className="w95-hint">Логин: латиница, цифры, _ . - · пароль от 6 символов</span>
              </div>
            )}

            {error && <div style={{ color: '#a00' }}>⚠️ {error}</div>}
            {info && <div style={{ color: '#060' }}>✉️ {info}</div>}

            <div className="w95-form-row" style={{ marginTop: 4 }}>
              <label />
              <button className="w95-btn" type="submit" disabled={busy} style={{ flex: 1 }}>
                {busy ? '…' : action}
              </button>
            </div>
          </form>

          <div className="w95-pick-foot">
            {mode !== 'login' && <button className="w95-btn" onClick={() => switchMode('login')}>Вход</button>}
            {mode !== 'register' && <button className="w95-btn" onClick={() => switchMode('register')}>Регистрация</button>}
            <div style={{ flex: 1 }} />
            {mode !== 'reset' && features.passwordReset && (
              <button className="w95-btn" onClick={() => switchMode('reset')}>Забыли пароль?</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
