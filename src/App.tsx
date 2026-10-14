import '@/lib/firebase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function App() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-6">
      <h1 className="text-center text-3xl font-bold">אטונלי</h1>
      <p className="text-center text-lg">תרגול מוזיקה בין השיעורים</p>
      <div className="flex flex-col gap-2">
        <Label htmlFor="demo">שם</Label>
        <Input id="demo" placeholder="איך קוראים לך?" />
      </div>
      <Button size="large">התחלה</Button>
    </main>
  )
}
