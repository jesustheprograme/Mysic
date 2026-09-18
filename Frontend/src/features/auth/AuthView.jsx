import { ArrowRight, Eye, EyeOff } from 'lucide-react'
import { useCallback, useState } from 'react'
import BrandLogo from '../../components/BrandLogo.jsx'
import GoogleSignInButton from './GoogleSignInButton.jsx'

const loginFields = [
  {
    id: 'login-email',
    name: 'email',
    label: 'Correo electronico',
    placeholder: 'Correo electronico',
    type: 'email',
    autoComplete: 'email',
  },
  {
    id: 'login-password',
    name: 'password',
    label: 'Contrasena',
    placeholder: 'Contrasena',
    type: 'password',
    autoComplete: 'current-password',
  },
]

const registerFields = [
  {
    id: 'register-name',
    name: 'username',
    label: 'Nombre de usuario',
    placeholder: 'Nombre de usuario',
    type: 'text',
    autoComplete: 'username',
  },
  {
    id: 'register-email',
    name: 'email',
    label: 'Correo electronico',
    placeholder: 'Correo electronico',
    type: 'email',
    autoComplete: 'email',
  },
  {
    id: 'register-password',
    name: 'password',
    label: 'Contrasena',
    placeholder: 'Contrasena',
    type: 'password',
    autoComplete: 'new-password',
  },
  {
    id: 'register-confirm-password',
    name: 'confirmPassword',
    label: 'Confirma contrasena',
    placeholder: 'Confirma contrasena',
    type: 'password',
    autoComplete: 'new-password',
  },
]

function AuthField({ id, name, label, placeholder, type, autoComplete }) {
  const [showPassword, setShowPassword] = useState(false)
  const isPassword = type === 'password'
  const inputType = isPassword && showPassword ? 'text' : type

  return (
    <div className="input-container">
      <input
        id={id}
        name={name}
        required
        type={inputType}
        className="auth-input"
        placeholder={placeholder}
        autoComplete={autoComplete}
      />
      <label htmlFor={id} className="input-label">{label}</label>
      {isPassword && (
        <button
          className="password-visibility"
          type="button"
          aria-label={showPassword ? 'Ocultar contrasena' : 'Mostrar contrasena'}
          title={showPassword ? 'Ocultar contrasena' : 'Mostrar contrasena'}
          onClick={() => setShowPassword((visible) => !visible)}
        >
          {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      )}
      <div className="input-underline" />
    </div>
  )
}

function AuthView({ authError, clearError, isSubmitting, onGoogleLogin, onLogin, onRegister }) {
  const [mode, setMode] = useState('login')
  const [formError, setFormError] = useState('')
  const isLogin = mode === 'login'
  const fields = isLogin ? loginFields : registerFields
  const displayedError = formError || authError

  function changeMode(nextMode) {
    setMode(nextMode)
    setFormError('')
    clearError()
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setFormError('')
    clearError()

    const formData = new FormData(event.currentTarget)
    const email = formData.get('email')
    const password = formData.get('password')

    if (!isLogin && password !== formData.get('confirmPassword')) {
      setFormError('Las contrasenas no coinciden.')
      return
    }

    try {
      if (isLogin) {
        await onLogin({
          email,
          password,
          remember: formData.get('rememberSession') === 'on',
        })
      } else {
        await onRegister({
          username: formData.get('username'),
          email,
          password,
        })
      }
    } catch {
      // El hook de autenticacion muestra el error devuelto por la API.
    }
  }

  const handleGoogleCredential = useCallback(async (credential) => {
    try {
      await onGoogleLogin(credential)
    } catch {
      // El hook de autenticacion muestra el error devuelto por la API.
    }
  }, [onGoogleLogin])

  const handleGoogleError = useCallback((message) => {
    setFormError(message)
  }, [])

  return (
    <main className="auth-page">
      <section className="auth-column">
        <div className="auth-brand">
          <BrandLogo className="auth-brand__logo" tone="dark" />
        </div>

        <div className="auth-panel">
          <header className="auth-heading">
            <h1>{isLogin ? '¡Bienvenido!' : 'Crea tu cuenta'}</h1>
            <p>
              {isLogin
                ? 'Inicia sesion y vuelve a tu musica.'
                : 'Completa tus datos para comenzar.'}
            </p>
          </header>

          <form className="auth-form" onSubmit={handleSubmit} key={mode}>
            <div className="auth-fields">
              {fields.map((field) => <AuthField key={field.id} {...field} />)}
            </div>

            {isLogin && (
              <div className="login-options">
                <label className="remember-control">
                  <input name="rememberSession" type="checkbox" defaultChecked />
                  <span>Mantener sesion</span>
                </label>
              </div>
            )}

            {displayedError && <p className="auth-error" role="alert">{displayedError}</p>}

            <button className="auth-submit" type="submit" disabled={isSubmitting}>
              <span>
                {isSubmitting
                  ? 'Procesando...'
                  : isLogin ? 'Iniciar sesion' : 'Crear cuenta'}
              </span>
              <ArrowRight size={18} aria-hidden="true" />
            </button>
          </form>

          {isLogin && (
            <>
              <div className="auth-divider"><span>o continua con</span></div>
              <GoogleSignInButton
                disabled={isSubmitting}
                onCredential={handleGoogleCredential}
                onError={handleGoogleError}
              />
            </>
          )}

          <p className="account-prompt">
            {isLogin ? 'No tienes una cuenta?' : 'Ya tienes una cuenta?'}{' '}
            <button type="button" onClick={() => changeMode(isLogin ? 'register' : 'login')}>
              {isLogin ? 'Creala' : 'Inicia sesion'}
            </button>
          </p>
        </div>
      </section>

      <section className="record-column" aria-label="Disco de vinilo">
        <div className="auth-vinyl" aria-hidden="true">
          <span className="vinyl-groove vinyl-groove--one" />
          <span className="vinyl-groove vinyl-groove--two" />
          <span className="vinyl-groove vinyl-groove--three" />
          <span className="vinyl-label"><span>Mysic</span><i /></span>
        </div>
      </section>
    </main>
  )
}

export default AuthView
