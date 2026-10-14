import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { AuthLayout } from '../../components/authLayout'
import { OtpSignIn } from '../../components/otpSignIn'

/** The billing party's way in: a mobile number and a one-time code. */
export default function PortalLogin() {
  const { partyLogin } = useAuth()
  const navigate = useNavigate()

  return (
    <AuthLayout
      caption="Customer portal"
      headline="Book a truck in a minute. Follow it to delivery."
      points={[
        'Place orders from your phone or your desk',
        'Your godowns are remembered, so you type them once',
        'See the truck, the driver and every stop as it happens',
      ]}
    >
      <OtpSignIn
        intro="We will send a one-time code to your mobile number. No password needed."
        requestOtp={(phone) => api.portal.requestOtp(phone)}
        verify={async (phone, otp) => {
          const session = await partyLogin(phone, otp)
          // A brand-new account has nothing to order against yet.
          navigate(session.company_count === 0 ? '/portal/companies' : '/portal', {
            replace: true,
          })
        }}
      />
    </AuthLayout>
  )
}
