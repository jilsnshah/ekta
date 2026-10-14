import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { AuthLayout } from '../../components/authLayout'
import { OtpSignIn } from '../../components/otpSignIn'

/**
 * Driver sign-in: mobile number, then the code.
 *
 * A driver account is created by the control room, so an unknown number is
 * told so plainly rather than being silently registered.
 */
export default function DriverLogin() {
  const { driverLogin } = useAuth()
  const navigate = useNavigate()

  return (
    <AuthLayout
      caption="Driver app"
      headline="Your trip, one stop at a time."
      points={[
        'Where to go next, and who to call there',
        'What to load and what to drop at every stop',
        'Mark each stop done — the control room sees it at once',
      ]}
    >
      <OtpSignIn
        intro="Use the mobile number the control room has on file for you."
        requestOtp={(phone) => api.driverApp.requestOtp(phone)}
        verify={async (phone, otp) => {
          await driverLogin(phone, otp)
          navigate('/driver', { replace: true })
        }}
      />
    </AuthLayout>
  )
}
