let authPanel = document.querySelector('.panel'), // панель для авторизации
    friendsPanel = document.querySelector('.panel-friends'), // основная панель со списками друзей
    //loader = document.querySelectorAll('.loader'), // лоадер для xhr запросов
    authButton = document.querySelector('#auth'), // кнопка авторизации
    saveButton = document.querySelector('#saveButton'); // кнопка сохранения состояния списков друзей

new Promise((resolve) => {
    if (document.readyState == 'complete'){
        resolve()
    } else {
        window.onload = resolve()
    }
}).then(() => {
    return new Promise((resolve) => {
        // Инициализация приложения в ВК
        VK.init({
            apiId: 5576661
        });

        // Определяем авторизован ли пользователь на ВКонтакте и разрешил ли доступ приложению к его данным
        // Если авторизован, то автоматически скрываем панель авторизации и показываем панель с друзьями
        // Если не авторизован, то ждем пока нажмет на кнопку авторизации
        // По нажатию открывается popup-окно для авторизации пользователя с его учетной записью ВКонтакте
        VK.Auth.getLoginStatus((response) => {
            if (response.session) {
                authPanel.style.visibility = 'hidden';
                resolve(response.session.mid);
            } else {
                authButton.addEventListener('click', () => {
                    VK.Auth.login(response => {
                        if (response.session) {
                            authPanel.style.visibility = 'hidden';
                            resolve(response.session.mid);
                        } else {
                            alert('Авторизация прошла не удачно!');
                        }
                    }, 2)
                });
            }
        });
    })
}).then((mid) => {
    // Показываем панель с друзьями
    friendsPanel.style.visibility = 'visible';

    // Проверяем сохранял ли пользователь списки в друзьями
    // Если сохранял, то "вытаскиваем" их из localStorage
    // Если не сохранял, то запрашиваем у ВКонтакте список его друзей
    if (localStorage[mid]) {
        let storage = JSON.parse(localStorage[mid]);
        return {friendsList: storage.friendsList, friendsFiltered: storage.friendsFiltered};
    } else {
        return new Promise((resolve, reject) => {
            // Вызывем метод запроса списка друзей пользователя на ВКонтакте
            VK.Api.call('friends.get', {fields: 'photo_50', version: 5.8}, (response) => {
                if (response.response) {
                    resolve(response.response);
                } else {
                    reject('Не удалось получить список друзей');
                }
            });
        })
    }
}).then((response) => {
    let closeButton = document.querySelector('.fa-times'), // кнопка закрытия панели со списками друзей
        searchInLeft = document.querySelector('#searchInLeft'), // поисковое поле в общем списке друзей
        searchInRight = document.querySelector('#searchInRight'), // поисковое поле в отсортированном списке друзей
        friendsPanel = document.querySelector('[data-content=friends-panel]'), // "рабочая" область панели со списками друзей
        source = document.querySelector("#friendsLi").innerHTML, // html разметка для Handlebars
        template = Handlebars.compile(source), // компилирование шаблона Handlebars
        friendsList = [], friendsFiltered = [], // массивы списков общих и отсортированных друзей соответственно
        targetElem, specterLi, specterLiX, specterLiY; // переменные для работы Drag'n'Drop

    // функция выводит список друзей на панели друзей
    // @param массив list массив со списком друзей
    // @param строка side список, в котором нужно вывести друзей (может быть только 'left' или 'right')
    let showFriendsList = (list, side) => {
        let listOfFriends = document.createElement('ul'),
            container = document.querySelector(`[data-list=${side}]`);
        if (!list.length) list = [{no_match: 'Друзья не найдены!'}];
        listOfFriends.innerHTML = template({friend: list});
        container.appendChild(listOfFriends);
    };

    // функция удаляет список друзей на панели друзей
    // @param строка side список, который нужно удалить (может быть только 'left' или 'right')
    let removeFriendsList = (side) => {
        let container = document.querySelector(`[data-list=${side}]`),
            list = container.children[1];
        list.remove();
    };

    // функция поиска друзей по имени и фамилии в любом из списков и вывода найденных на панель друзьей
    let searchInList = (e) => {
        let search = e.target;

        // непосредственно поиск друзей в указанном списке и их вывод
        // @param массив list массив со списком друзей
        // @param строка side список, в котором нужно отобразить друзей (может быть только 'left' или 'right')
        let localSearch = (list, side) => {
            if (list.length) {
                removeFriendsList(side);
                showFriendsList(list.filter(obj => {
                    return obj.first_name.toLowerCase().startsWith(search.value.toLowerCase()) ||
                           obj.last_name.toLowerCase().startsWith(search.value.toLowerCase()) ||
                           (obj.first_name + ' ' + obj.last_name).toLowerCase().startsWith(search.value.toLowerCase())
                }),side);
            }
            return list;
        };

        // определение в каком списке нужно производить поиск
        if (search.id.indexOf('Left') > 0) {
            friendsList = localSearch(friendsList,'left');
        } else if (search.id.indexOf('Right') > 0) {
            friendsFiltered = localSearch(friendsFiltered,'right');
        }
    };

    // функция "переброса" друга из одного списка в другой
    let toggleFriend = (e) => {
        let elem = e.target || e.children[1].children[0],
            parentElem = elem.parentNode;

        // изменение принадлежности друга к текущему списку и запись его в новый
        // отображение измененных списков друзей
        // @param массив listMain массив друзей, в который будет добавлен друг
        // @param массив listSecondary массив друзей, из которого будет удален друг
        // @param строка sideM список, в котором нужно отобразить нового друга
        // @param строка sideS список, в котором нужно удалить друга
        let localToggle = (listMain, listSecondary, sideM, sideS) => {
            let li = parentElem.parentNode,
                uid = parentElem.previousElementSibling.dataset.id;
            if (listMain.length) removeFriendsList(sideM);
            listMain.push(listSecondary.splice(listSecondary.findIndex(obj => {
                if (obj.uid == uid) {
                    (!obj.filtered)? obj.filtered = true : delete obj.filtered;
                    return true;
                } else {
                    return false;
                }
            }),1)[0]);
            li.remove();
            showFriendsList(listMain,sideM);
            if (!listSecondary.length) removeFriendsList(sideS);
            return [listMain,listSecondary];
        };

        // определение в куда нужно добавить и от куда нужно удалить друга
        if (elem.classList.contains('fa-plus')) {
            [friendsFiltered,friendsList] = localToggle(friendsFiltered,friendsList,'right','left');
        } else if (elem.classList.contains('fa-times')){
            [friendsList,friendsFiltered] = localToggle(friendsList,friendsFiltered,'left','right');
        }
    };

    // функция "захватывает" друга по нажатию левой кнопки мыши и создает его копию
	let captureFriend = (e) => {
		if (e.button == 0) {
		    if (specterLi) {
                specterLi.remove();
                specterLi = specterLiX = specterLiY = targetElem = null;
                return false;
            }
			let elem = e.target.classList.contains('fa')? null : e.target.closest('li');
            if (elem && elem.children[0].dataset.id) {
                e.preventDefault();
                targetElem = elem;
                specterLi = document.createElement('div');
                with (specterLi) {
                    innerHTML = elem.innerHTML;
                    className = 'specter';
                    style.left = e.pageX - e.offsetX + 'px';
                    style.top = e.pageY - e.offsetY + 'px';
                    style.width = window.getComputedStyle(elem).width;
                }
                specterLiX = e.offsetX;
                specterLiY = e.offsetY;
                document.body.appendChild(specterLi);
            }
		}
	};

	// перемещение копии друга при зажатой левой кнопки мыши
	let moveFriend = (e) => {
		if (specterLi){
            specterLi.style.left = e.pageX - specterLiX + 'px';
            specterLi.style.top = e.pageY - specterLiY + 'px';
		}
	};

	// окончание перемещения друга при отпуске левой кнопки мыши
    // вызов функции "переброса" друга из одного списка в другой
	let releaseFriend = (e) => {
		if (e.button == 0) {
		    if (specterLi) {
			    specterLi.style.visibility = 'hidden';
                let targetList = document.elementFromPoint(e.clientX,e.clientY).closest('.container'),
                    dataList = targetList? targetList.dataset.list : null,
                    isElemLeft = targetElem.children[1].children[0].classList.contains('fa-plus');

                if ((dataList == 'right' && isElemLeft) ||
                    (dataList == 'left' && !isElemLeft)) {
                    specterLi.style.visibility = 'visible';
                    specterLi.style.border = '3px #ff8663 solid';
                    toggleFriend(targetElem);
                }
                setTimeout(() => {
                    specterLi.remove();
                    specterLi = specterLiX = specterLiY = targetElem = null;
                },100);
            }
		}
	};

	// обработка нажатия конопки "сохранить"
    // сохранение состояния списков друзей в localStorage
	let saveSession = () => {
        localStorage[VK.Auth.getSession().mid] = JSON.stringify({friendsList, friendsFiltered});
        alert('Данные успешно сохранены!');
	};

	// обработка нажатия кнопки закрытия панели со списками друзей
    // "убивает" текущую сессию и перегружает страницу
    let logout = () => {
        if (confirm('Все не сохраненные данные будут удалены. Вы действительно хотите закончить работу с приложением?')) {
            VK.Auth.logout(response => {
                if (!response.session) {
                    /*friendsPanel.style.visibility = 'hidden';
                    authPanel.style.visibility = 'visible';*/
                    location.reload();
                }
            })
        }
    };

    // определяем что пришло с предыдущего шага:
    // если пользователь ранее когда-либо сохранял списки друзей, то вернется объект с сохраненными списками друзей
    // если не сохранял, то вернеться массив друзей, полученный от ВКонтакте
    if (!response.length) {
        friendsList = response.friendsList;
        friendsFiltered = response.friendsFiltered;
    } else {
        friendsList = response;
    }

    // избавляемся от заблокированных друзей и выводим списки друзей
    friendsList = friendsList.filter(obj => {return !obj.deactivated});
    showFriendsList(friendsList, 'left');
    if (friendsFiltered.length) showFriendsList(friendsFiltered, 'right');

    searchInLeft.addEventListener('input', searchInList);
    searchInRight.addEventListener('input', searchInList);
    friendsPanel.addEventListener('click', toggleFriend);
    saveButton.addEventListener('click', saveSession);
	
    document.body.addEventListener('mousedown', captureFriend);
    document.body.addEventListener('mousemove', moveFriend);
    document.body.addEventListener('mouseup', releaseFriend);
	document.ondrag = function() {return false};
	document.onselectstart = function() {return false};

    closeButton.addEventListener('click', logout);

}).catch(error => {
    alert(error);
});