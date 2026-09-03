export function acceptedInviteMessage(existingAccount: boolean) {
  return existingAccount
    ? "Приглашение принято. Войдите с паролем существующей учётной записи. Введённый здесь пароль не изменялся."
    : "Приглашение принято. Теперь можно войти с новым паролем.";
}
