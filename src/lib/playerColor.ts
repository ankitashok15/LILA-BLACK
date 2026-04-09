export function playerHue(userId: string, isBot: boolean): string {
  if (isBot) return 'hsl(215 12% 45%)'
  let h = 0
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0
  const hue = h % 300 + 20
  return `hsl(${hue} 70% 55%)`
}
