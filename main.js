// Имя именинника: меняется в одном месте
const NAME = 'Дима'

document.querySelectorAll('[data-name]').forEach((el) => {
  el.textContent = NAME
})

document.title = 'С днём рождения, ' + NAME + '!'
