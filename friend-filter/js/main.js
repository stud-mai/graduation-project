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

    // функция выводит списки друзей на панели друзей
    // @param массив list массив со списком друзей
    let loadFriendsListsIntoDOM = (list) => {
        let container = document.querySelectorAll('.container');

        for (let i = 0; i < container.length; i++){
            let listOfFriends = document.createElement('ul');
            listOfFriends.innerHTML = template({friend: list});
            container[i].appendChild(listOfFriends);
        }
    };

    // функция показывает всех друзей, содержащихся в массиве (читай найденных через поиск)
    // @param массив list массив со списком друзей
    // @param строка side список, в котором нужно вывести друзей (может быть только 'left' или 'right')
    let showFoundFriends = (list, side) => {
        let style = document.querySelector(`#show-hide-${side}`);

        style.innerText = `div[data-list='${side}'] li {display:none} `;
        if (list.length) {
            for (let obj of list){
                style.innerText += `div[data-list='${side}'] li[data-id='${obj.uid}'] {display:block} `;
            }
            /*list.forEach(obj => {
                style.innerText += `div[data-list='${side}'] li[data-id='${obj.uid}'] {display:block} `;
                console.log(style.innerText);
            })*/
        } else {
            style.innerText += `div[data-list='${side}'] .no-match {display:block} `;
        }
    };

    // функция делает видимым определенного друга
    // @param строка uid строка, содержащая уникальный номер друга
    // @param строка side список, в котором нужно показать друга
    let showFriend = (uid, side) => {
        let style = document.querySelector(`#show-hide-${side}`);
        style.innerText += `div[data-list='${side}'] li[data-id='${uid}'] {display:block} `;
    };

    // функция скрывает определенного друга
    // @param строка uid строка, содержащая уникальный номер друга
    // @param строка side список, в котором нужно показать друга
    let hideFriend = (uid, side) => {
        let style = document.querySelector(`#show-hide-${side}`);
        console.time('styleHide');
        style.innerText += `div[data-list='${side}'] li[data-id='${uid}'] {display:none} `;
        console.timeEnd('styleHide');
    };

    // функция определяет, есть ли среди друзей тот, который удовлетворяет строке поиска
    // @param объект obj объект, содержащая сведения о друге
    // @param элемент searchField элемент строки поиска (input)
    let isIncluded = (obj, searchField) => {
        return obj.first_name.toLowerCase().startsWith(searchField.value.toLowerCase()) ||
                obj.last_name.toLowerCase().startsWith(searchField.value.toLowerCase()) ||
                (obj.first_name + ' ' + obj.last_name).toLowerCase().startsWith(searchField.value.toLowerCase())
    };

    // функция поиска друзей по имени и фамилии в любом из списков и вывода найденных на панель друзьей
    let searchInList = (e) => {
        let search = e.target;

        // непосредственно поиск друзей в указанном списке и их вывод
        // @param массив list массив со списком друзей
        // @param строка side список, в котором нужно отобразить друзей
        let localSearch = (list, side) => {
            if (list.length) {
                showFoundFriends(list.filter(obj => {return isIncluded(obj,search)}),side);
            }
        };

        // определение в каком списке нужно производить поиск
        if (search == searchInLeft) {
            localSearch(friendsList,'left');
        } else if (search == searchInRight) {
            localSearch(friendsFiltered,'right');
        }
    };

    // функция "переброса" друга из одного списка в другой
    let toggleFriend = (e) => {
        let elem = e.target || e.children[1].children[0],
            parentLi = elem.parentNode.parentNode,
            whatBtn = elem.closest('.container')? elem.closest('.container').dataset.list : null;

        // изменение принадлежности друга к текущему списку и запись его в новый
        // отображение измененных списков друзей
        // @param массив listMain массив друзей, в который будет добавлен друг
        // @param массив listSecondary массив друзей, из которого будет удален друг
        // @param строка sideM список, в котором нужно отобразить нового друга
        // @param строка sideS список, в котором нужно удалить друга
        let localToggle = (listMain, listSecondary, sideM, sideS) => {
            let uid = parentLi.dataset.id,
                searchField = (sideM == 'right')? searchInRight : searchInLeft,
                friend = {};

            listMain.push(listSecondary.splice(listSecondary.findIndex(obj => {
                if (obj.uid == uid) {
                    friend = obj;
                    return true;
                } else {
                    return false;
                }
            }),1)[0]);

            if (isIncluded(friend,searchField)) {
                console.time('show');
                showFriend(uid,sideM);
                console.timeEnd('show');
            }
            console.time('hide');
            hideFriend(uid,sideS);
            console.timeEnd('hide');
            return [listMain,listSecondary];
        };

        // определение куда нужно добавить и от куда нужно удалить друга
        if (elem.classList.contains('fa') && whatBtn == 'left') {
            console.time('toggle Left to Right');
            [friendsFiltered,friendsList] = localToggle(friendsFiltered,friendsList,'right','left');
            console.timeEnd('toggle Left to Right');
        } else if (elem.classList.contains('fa') && whatBtn == 'right'){
            console.time('toggle Right to Left');
            [friendsList,friendsFiltered] = localToggle(friendsList,friendsFiltered,'left','right');
            console.timeEnd('toggle Right to Left');
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
            if (elem && elem.dataset.id) {
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
                    whatBtn = targetElem.closest('.container')? targetElem.closest('.container').dataset.list : null;

                if ((dataList == 'right' && whatBtn == 'left') ||
                    (dataList == 'left' && whatBtn == 'right')) {
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
    // заполняем соответствующие массивы
    // несмотря на то, что вернется, грузим в DOM полный спикок друзей
    if (!response.length) {
        friendsList = response.friendsList;
        friendsFiltered = response.friendsFiltered;
        showFoundFriends(friendsList,'left');
        showFoundFriends(friendsFiltered,'right');
        loadFriendsListsIntoDOM(friendsList.concat(friendsFiltered));
    } else {
        friendsList = response;
        // избавляемся от заблокированных друзей и выводим списки друзей
        friendsList = friendsList.filter(obj => {return !obj.deactivated});
        loadFriendsListsIntoDOM(friendsList);
    }

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