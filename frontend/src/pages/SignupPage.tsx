import { SignupForm } from '../components/auth/SignupForm';
import { RunYourFamilyButton } from '../components/common/RunYourFamilyButton';

export function SignupPage() {
  return (
    <div className="relative flex min-h-dvh items-center justify-center bg-stone-950 px-4 overflow-y-auto">
      <img src="/banner.png" alt="" className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-[600px] max-w-none opacity-25" />
      <div className="relative w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="font-serif text-4xl font-bold text-gold-500">The Family</h1>
          <p className="mt-2 text-stone-400">Become a made member.</p>
        </div>
        <div className="rounded-xl border border-stone-800 bg-stone-900 p-6">
          <SignupForm />
        </div>
        <div className="mt-6 flex justify-center">
          <RunYourFamilyButton />
        </div>
      </div>
    </div>
  );
}
