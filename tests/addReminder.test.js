// tests/addReminder.test.js
// Esempio di test unitario per la funzione addReminder (mock)

test('addReminder aggiunge un promemoria valido', async () => {
  const reminderService = require('../src/services/reminderService');
  const result = await reminderService.createReminder('user1', '09:00', 'Test', 'work');
  expect(result).toHaveProperty('id');
  expect(result.text).toBe('Test');
});
